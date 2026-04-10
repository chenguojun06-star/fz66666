package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.production.dto.QualityAiSuggestionResponse;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * AI质检建议编排器（#59）
 *
 * <p><b>v2 升级（真实 LLM 驱动）</b>：先读取订单关联的款式信息、BOM 面料成分、工序列表，
 * 构建富含业务上下文的 Prompt，调用 DeepSeek（或 LiteLLM 网关）生成
 * <em>针对这件衣服的个性化质检指引</em>。AI 不可用时自动降级到规则引擎。
 *
 * <p>数据链：订单 → styleId → StyleInfo + BOM + Process → LLM → 结构化 checkpoints
 *
 * <p><b>v3 缓存优化</b>：同一款式的质检要点相同，按 styleId 缓存 LLM 结果，
 * 仅在出现新次品记录或超过 24h 时才重新生成，历史次品率仍然每次实时计算。
 */
@Service
@Slf4j
public class QualityAiSuggestionOrchestrator {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final long CACHE_TTL_MS = 24 * 60 * 60 * 1000L; // 24小时

    /** 按款式ID缓存LLM生成的质检要点，同一款式只调一次LLM */
    private final Map<String, CachedStyleCheckpoints> styleCache = new ConcurrentHashMap<>();

    /** 缓存的款式质检要点（与具体订单解耦，仅包含款式维度的信息） */
    private static class CachedStyleCheckpoints {
        final List<String> checkpoints;
        final String llmUrgentTip;
        final long createdAt;

        CachedStyleCheckpoints(List<String> checkpoints, String llmUrgentTip) {
            this.checkpoints = checkpoints;
            this.llmUrgentTip = llmUrgentTip;
            this.createdAt = System.currentTimeMillis();
        }

        boolean isExpired() {
            return (System.currentTimeMillis() - createdAt) > CACHE_TTL_MS;
        }
    }

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    // ─── 规则库 ───────────────────────────────────────────────────────

    /** 通用质检要点（精简4条，按方向分） */
    private static final List<String> COMMON_CHECKPOINTS = Arrays.asList(
        "🔴 面料：检查色差/污渍/破损/抽丝",
        "🔴 车缝：缝线均匀无跳线，线头修净",
        "🟡 配饰：纽扣/拉链牢固，金属件无毛刺",
        "🟡 标识：吊牌/洗标/尺码标完整正确"
    );

    /** 按品类的专属质检要点（精简2条，与通用4条合计≤6条） */
    private static final Map<String, List<String>> CATEGORY_CHECKPOINTS = new HashMap<>();
    static {
        // 上衣/衬衫
        CATEGORY_CHECKPOINTS.put("shirt", Arrays.asList(
            "🔴 领型端正左右对称，扣眼均匀",
            "🟡 袖长一致，肩缝平整无起拱"
        ));
        CATEGORY_CHECKPOINTS.put("top", CATEGORY_CHECKPOINTS.get("shirt"));
        // 裤子
        CATEGORY_CHECKPOINTS.put("pants", Arrays.asList(
            "🔴 裤长左右允差≤0.3cm，腰头平整",
            "🟡 拉链/钮扣开合顺畅，口袋对称"
        ));
        CATEGORY_CHECKPOINTS.put("trousers", CATEGORY_CHECKPOINTS.get("pants"));
        // 裙子
        CATEGORY_CHECKPOINTS.put("skirt", Arrays.asList(
            "🔴 裙摆下摆均匀平整，腰头均匀",
            "🟡 拉链/暗扣安装平整无外露"
        ));
        // 连衣裙
        CATEGORY_CHECKPOINTS.put("dress", Arrays.asList(
            "🔴 腰线定位准确，领口下摆工整",
            "🟡 里布贴合无起皱，功能件顺畅"
        ));
        // 外套/夹克
        CATEGORY_CHECKPOINTS.put("jacket", Arrays.asList(
            "🔴 驳头对称，里衬无脱层挺括",
            "🟡 口袋盖对称，拉链/扣子流畅"
        ));
        CATEGORY_CHECKPOINTS.put("coat", CATEGORY_CHECKPOINTS.get("jacket"));
        CATEGORY_CHECKPOINTS.put("outerwear", CATEGORY_CHECKPOINTS.get("jacket"));
        // T恤
        CATEGORY_CHECKPOINTS.put("t-shirt", Arrays.asList(
            "🔴 领圈牢固弹性均匀，下摆宽窄一致",
            "🟡 印花/绣花居中无脱色偏移"
        ));
        CATEGORY_CHECKPOINTS.put("tshirt", CATEGORY_CHECKPOINTS.get("t-shirt"));
        // 童装（增加安全合规标准）
        CATEGORY_CHECKPOINTS.put("kids", Arrays.asList(
            "🔴 GB31701/CPSC：小部件拉力≥70N防吞食",
            "🟡 绳带≤7.5cm(CPSC)，金属件无镍超标"
        ));
        // 婴幼儿装
        CATEGORY_CHECKPOINTS.put("infant", Arrays.asList(
            "🔴 GB18401-A类：甲醛≤20mg/kg，pH4.0-7.5",
            "🟡 禁止绳带/可拆卸件，面料柔软无刺激"
        ));
        CATEGORY_CHECKPOINTS.put("baby", CATEGORY_CHECKPOINTS.get("infant"));
        // ===== 面料类型专属要点 =====
        // 牛仔
        CATEGORY_CHECKPOINTS.put("denim", Arrays.asList(
            "🔴 色差必查：同批次深浅对比，洗水后色牢度",
            "🟡 车缝用粗线，针距均匀，铆钉牛固"
        ));
        CATEGORY_CHECKPOINTS.put("jeans", CATEGORY_CHECKPOINTS.get("denim"));
        // 毛衣/针织
        CATEGORY_CHECKPOINTS.put("sweater", Arrays.asList(
            "🔴 检查拉毛/起球/脱线，罗口弹性恢复",
            "🟡 缩水率≤5%，尺寸拉伸后回弹正常"
        ));
        CATEGORY_CHECKPOINTS.put("knitwear", CATEGORY_CHECKPOINTS.get("sweater"));
        CATEGORY_CHECKPOINTS.put("毛衣", CATEGORY_CHECKPOINTS.get("sweater"));
        // 真丝
        CATEGORY_CHECKPOINTS.put("silk", Arrays.asList(
            "🔴 轻拿轻放防勾丝，禁止针粗线粗车缝",
            "🟡 擦洗变色必测，光泽均匀无水印"
        ));
        CATEGORY_CHECKPOINTS.put("真丝", CATEGORY_CHECKPOINTS.get("silk"));
        // 色丁/缚面
        CATEGORY_CHECKPOINTS.put("satin", Arrays.asList(
            "🔴 表面禁止刺尖接触，防勾丝抽纱",
            "🟡 缝边火封处理，裁片方向一致"
        ));
        CATEGORY_CHECKPOINTS.put("色丁", CATEGORY_CHECKPOINTS.get("satin"));
        // 蕾丝
        CATEGORY_CHECKPOINTS.put("lace", Arrays.asList(
            "🔴 花型对花对条，接缝自然无断点",
            "🟡 边缘不脱纱，底衣贴合不透光"
        ));
        CATEGORY_CHECKPOINTS.put("蕾丝", CATEGORY_CHECKPOINTS.get("lace"));
        // 羽绒
        CATEGORY_CHECKPOINTS.put("down", Arrays.asList(
            "🔴 钻绒测试：揉压不得渗绒，接缝处密封",
            "🟡 充绒量称重核对，左右均匀无结团"
        ));
        CATEGORY_CHECKPOINTS.put("羽绒", CATEGORY_CHECKPOINTS.get("down"));
        // 纱料/雪纺
        CATEGORY_CHECKPOINTS.put("chiffon", Arrays.asList(
            "🔴 易滑丝用特氟龙压脚，放慢车速",
            "🟡 裁片必须锁边，缝份放宽0.5cm"
        ));
        CATEGORY_CHECKPOINTS.put("雪纺", CATEGORY_CHECKPOINTS.get("chiffon"));
        // 麻料
        CATEGORY_CHECKPOINTS.put("linen", Arrays.asList(
            "🔴 预缩必做，裁后及时码齐防变形",
            "🟡 整烫温度≤180°C，避免缝份拉豁"
        ));
        CATEGORY_CHECKPOINTS.put("麻", CATEGORY_CHECKPOINTS.get("linen"));
    }

    /** 按次品类别的AI建议（精简1句话，可采纳为返修备注） */
    private static final Map<String, String> DEFECT_SUGGESTIONS = new LinkedHashMap<>();
    static {
        DEFECT_SUGGESTIONS.put("appearance_integrity",
            "轻微起毛/抽丝可修补，严重破损重做。批量出现请反馈供应商");
        DEFECT_SUGGESTIONS.put("size_accuracy",
            "先查裁床版型偏差，试蒸汽定型回正。尺差>1cm建议重做");
        DEFECT_SUGGESTIONS.put("process_compliance",
            "核查缝份/针距是否合规，本批次产品全检");
        DEFECT_SUGGESTIONS.put("functional_effectiveness",
            "拉链/扣子更换或加固，同批次全部复检");
        DEFECT_SUGGESTIONS.put("other",
            "拍照留档交品控主管确认。批量问题立即上报");
    }

    // ─── 对外接口 ──────────────────────────────────────────────────────

    public QualityAiSuggestionResponse getSuggestion(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            return buildEmpty();
        }

        // 1. 加载订单
        ProductionOrder order = productionOrderService.getById(orderId.trim());
        if (order == null) {
            return buildEmpty();
        }

        // 2. 历史次品率（每次实时计算，不缓存）
        Double historicalDefectRate = null;
        String historicalVerdict = "good";
        int defectRecordCount = 0;
        try {
            List<ProductWarehousing> records = productWarehousingService.list(
                new LambdaQueryWrapper<ProductWarehousing>()
                    .eq(ProductWarehousing::getOrderId, orderId.trim())
                    .eq(ProductWarehousing::getDeleteFlag, 0)
            );
            defectRecordCount = records.size();
            if (!records.isEmpty()) {
                int totalQ  = records.stream().mapToInt(r -> r.getQualifiedQuantity()   == null ? 0 : r.getQualifiedQuantity()).sum();
                int totalUQ = records.stream().mapToInt(r -> r.getUnqualifiedQuantity() == null ? 0 : r.getUnqualifiedQuantity()).sum();
                int processed = totalQ + totalUQ;
                if (processed > 0) {
                    historicalDefectRate = (double) totalUQ / processed;
                    if      (historicalDefectRate > 0.30) historicalVerdict = "critical";
                    else if (historicalDefectRate > 0.15) historicalVerdict = "warn";
                }
            }
        } catch (Exception e) {
            log.warn("[QualityAI] 历史数据查询失败: orderId={}", orderId, e);
        }

        // 3. 按款式缓存：同款式质检要点只调一次LLM
        String styleId = order.getStyleId();
        if (StringUtils.hasText(styleId) && inferenceOrchestrator.isAnyModelEnabled()) {
            CachedStyleCheckpoints cached = styleCache.get(styleId);
            if (cached != null && !cached.isExpired()) {
                log.debug("[QualityAI] 命中款式缓存: styleId={}, orderId={}", styleId, orderId);
                return buildFromCache(cached, order, historicalDefectRate, historicalVerdict);
            }

            // 缓存未命中或已过期 → 调LLM
            try {
                QualityAiSuggestionResponse llmResult = callLLM(order, historicalDefectRate, historicalVerdict);
                if (llmResult != null) {
                    // 提取纯LLM质检要点（去除次品率警示行），存入缓存
                    List<String> pureCheckpoints = new ArrayList<>(llmResult.getCheckpoints());
                    pureCheckpoints.removeIf(cp -> cp.startsWith("🔴") || cp.startsWith("🟡"));
                    styleCache.put(styleId, new CachedStyleCheckpoints(pureCheckpoints, llmResult.getUrgentTip()));
                    log.info("[QualityAI] LLM生成质检指引成功并缓存: styleId={}, orderId={}, checkpoints={}", styleId, orderId, llmResult.getCheckpoints().size());
                    return llmResult;
                }
            } catch (Exception e) {
                log.warn("[QualityAI] LLM调用失败，降级规则引擎: orderId={}, err={}", orderId, e.getMessage());
            }
        }

        // 4. 规则引擎兜底
        return buildFromRules(order, historicalDefectRate, historicalVerdict);
    }

    /** 从缓存的款式质检要点重建完整响应（叠加订单级次品率和急单信息） */
    private QualityAiSuggestionResponse buildFromCache(CachedStyleCheckpoints cached,
                                                        ProductionOrder order,
                                                        Double defectRate,
                                                        String verdict) {
        List<String> checkpoints = new ArrayList<>(cached.checkpoints);

        // 叠加次品率警示
        if ("critical".equals(verdict) && defectRate != null) {
            checkpoints.add(0, "🔴 此订单历史次品率 " + Math.round(defectRate * 100) + "%（严重偏高），请严格全检，重点关注批次一致性");
        } else if ("warn".equals(verdict) && defectRate != null) {
            checkpoints.add(0, "🟡 此订单历史次品率 " + Math.round(defectRate * 100) + "%（偏高），需加强抽检力度");
        }

        // 急单提示：优先用LLM缓存的，否则兜底
        String urgentTip = cached.llmUrgentTip;
        if (urgentTip == null && "urgent".equalsIgnoreCase(order.getUrgencyLevel())) {
            urgentTip = "⚠️ 此为急单，请优先处理！赶工不得降低质检标准，发现异常仍须如实记录。";
        }

        return QualityAiSuggestionResponse.builder()
                .orderNo(order.getOrderNo())
                .styleNo(order.getStyleNo())
                .styleName(order.getStyleName())
                .productCategory(order.getProductCategory())
                .urgent("urgent".equalsIgnoreCase(order.getUrgencyLevel()))
                .historicalDefectRate(defectRate)
                .historicalVerdict(verdict)
                .checkpoints(checkpoints)
                .defectSuggestions(DEFECT_SUGGESTIONS)
                .urgentTip(urgentTip)
                .build();
    }

    // ─── 真实 LLM 调用 ────────────────────────────────────────────────

    private QualityAiSuggestionResponse callLLM(ProductionOrder order,
                                                 Double defectRate,
                                                 String verdict) {
        // 加载款式 + BOM + 工序
        StyleInfo style = null;
        List<StyleBom> boms = Collections.emptyList();
        List<StyleProcess> processes = Collections.emptyList();

        if (StringUtils.hasText(order.getStyleId())) {
            try {
                Long styleIdLong = Long.parseLong(order.getStyleId().trim());
                style     = styleInfoService.getDetailById(styleIdLong);
                boms      = styleBomService.listByStyleId(styleIdLong);
                processes = styleProcessService.listByStyleId(styleIdLong);
            } catch (Exception e) {
                log.warn("[QualityAI] 款式数据加载异常: styleId={}, {}", order.getStyleId(), e.getMessage());
            }
        }

        String systemPrompt = buildSystemPrompt();
        String userMessage  = buildUserMessage(order, style, boms, processes, defectRate, verdict);

        var result = inferenceOrchestrator.chat("quality_inspection", systemPrompt, userMessage);
        if (!result.isSuccess() || !StringUtils.hasText(result.getContent())) {
            return null;
        }

        return parseAiResponse(result.getContent(), order, defectRate, verdict);
    }

    private String buildSystemPrompt() {
        return "你是服装品控专家AI，任务：根据订单真实数据生成精准质检清单。\n\n" +
               "【铁律】\n" +
               "1. 最多6条，每条≤25字，只写最关键的。废话=扣分\n" +
               "2. 必须围绕4个方向：面料→车缝→配饰/辅料→安全合规，每方向最多2条\n" +
               "3. 面料层：根据实际材质写（雪纺查抽丝/纯棉查缩水/弹力布查回弹）\n" +
               "4. 车缝层：结合工序难点（暗缝/拼接/包边/拉链等）\n" +
               "5. 配饰层：纽扣拉力≥70N/金属件无毛刺/绳带长度合规\n" +
               "6. 安全合规层（强制触发条件）：\n" +
               "   - 童装/母婴：绳带禁令(CPSC 16CFR1120/GB 31701)、小部件吞食风险、甲醛≤20mg/kg\n" +
               "   - 出口美国：CPSIA含铅≤100ppm、阻燃(16CFR1610/1615)\n" +
               "   - 出口欧盟：REACH镍释放≤0.5μg/cm²、AZO偶氮≤30mg/kg\n" +
               "   - 内销：GB 18401 pH 4.0-7.5、色牢度≥3-4级\n" +
               "7. 每条标注重要级别：🔴关键(必查) 🟡注意(抽查)\n" +
               "8. 历史次品率高时，第一条指明重点排查方向\n\n" +
               "输出纯JSON：{\"checkpoints\":[\"🔴 xxx\",\"🟡 xxx\",...],\"urgentTip\":\"急单提示或null\",\"specialRisks\":\"一句话风险\"}";
    }

    private String buildUserMessage(ProductionOrder order,
                                     StyleInfo style,
                                     List<StyleBom> boms,
                                     List<StyleProcess> processes,
                                     Double defectRate,
                                     String verdict) {
        StringBuilder sb = new StringBuilder();

        // 订单基础信息
        sb.append("【订单信息】\n");
        sb.append("订单号：").append(nvl(order.getOrderNo(), "-")).append("\n");
        sb.append("款号：").append(nvl(order.getStyleNo(), "-"))
          .append("，款名：").append(nvl(order.getStyleName(), "-")).append("\n");
        sb.append("品类：").append(nvl(order.getProductCategory(), "未知")).append("\n");
        sb.append("工厂：").append(nvl(order.getFactoryName(), "未知")).append("\n");
        sb.append("生产数量：").append(order.getOrderQuantity()).append("件\n");
        sb.append("急单：").append("urgent".equalsIgnoreCase(order.getUrgencyLevel()) ? "是（需优先处理）" : "否").append("\n");

        if (defectRate != null) {
            String riskDesc = "critical".equals(verdict) ? "严重偏高！请严格全检" :
                              "warn".equals(verdict)     ? "偏高，需加强抽检"     : "正常";
            sb.append("历史次品率：").append(Math.round(defectRate * 100)).append("% (").append(riskDesc).append(")\n");
        } else {
            sb.append("历史次品率：暂无记录（首批或新款）\n");
        }

        // 款式详情
        if (style != null) {
            sb.append("\n【款式详情】\n");
            if (StringUtils.hasText(style.getFabricComposition())) {
                sb.append("面料成分：").append(style.getFabricComposition()).append("\n");
            }
            if (StringUtils.hasText(style.getWashInstructions())) {
                sb.append("洗涤说明：").append(style.getWashInstructions()).append("\n");
            }
            if (StringUtils.hasText(style.getDescription())) {
                sb.append("款式描述：").append(style.getDescription()).append("\n");
            }
        }

        // BOM 物料
        if (!boms.isEmpty()) {
            sb.append("\n【物料清单（BOM）】\n");
            boms.forEach(bom -> {
                sb.append("- ").append(nvl(bom.getMaterialName(), "未命名"));
                if (StringUtils.hasText(bom.getFabricComposition())) {
                    sb.append("（").append(bom.getFabricComposition()).append("）");
                }
                if (bom.getUsageAmount() != null) {
                    sb.append("，用量 ").append(bom.getUsageAmount()).append(nvl(bom.getUnit(), ""));
                }
                if (StringUtils.hasText(bom.getMaterialType())) {
                    sb.append("，类型：").append(bom.getMaterialType());
                }
                sb.append("\n");
            });
        }

        // 工序列表
        if (!processes.isEmpty()) {
            sb.append("\n【工序流程】\n");
            String processList = processes.stream()
                .sorted(Comparator.comparingInt(p -> (p.getSortOrder() == null ? 99 : p.getSortOrder())))
                .map(p -> {
                    String desc = nvl(p.getProcessName(), "工序");
                    if (StringUtils.hasText(p.getDifficulty()) && !"normal".equalsIgnoreCase(p.getDifficulty())
                            && !"普通".equals(p.getDifficulty())) {
                        desc += "（难度：" + p.getDifficulty() + "）";
                    }
                    return desc;
                })
                .collect(Collectors.joining(" → "));
            sb.append(processList).append("\n");
        }

        sb.append("\n请基于以上真实数据，生成 4~6 条精准质检要点（JSON格式），严禁超过6条。");
        return sb.toString();
    }

    private QualityAiSuggestionResponse parseAiResponse(String content,
                                                          ProductionOrder order,
                                                          Double defectRate,
                                                          String verdict) {
        String json = extractJson(content);
        if (json == null) {
            log.warn("[QualityAI] 未找到JSON块: content={}", content.length() > 200 ? content.substring(0, 200) : content);
            return null;
        }
        try {
            JsonNode node = JSON.readTree(json);
            List<String> checkpoints = new ArrayList<>();
            if (node.has("checkpoints") && node.get("checkpoints").isArray()) {
                for (JsonNode cp : node.get("checkpoints")) {
                    String text = cp.asText().trim();
                    if (!text.isEmpty()) checkpoints.add(text);
                }
            }
            if (checkpoints.isEmpty()) return null;

            // 次品率首行警示
            if ("critical".equals(verdict) && defectRate != null) {
                checkpoints.add(0, "🔴 此订单历史次品率 " + Math.round(defectRate * 100) + "%（严重偏高），请严格全检，重点关注批次一致性");
            } else if ("warn".equals(verdict) && defectRate != null) {
                checkpoints.add(0, "🟡 此订单历史次品率 " + Math.round(defectRate * 100) + "%（偏高），需加强抽检力度");
            }

            String urgentTip = null;
            if (node.has("urgentTip") && !node.get("urgentTip").isNull()) {
                urgentTip = node.get("urgentTip").asText().trim();
                if (urgentTip.isEmpty()) urgentTip = null;
            }
            if (urgentTip == null && "urgent".equalsIgnoreCase(order.getUrgencyLevel())) {
                urgentTip = "⚠️ 此为急单，请优先处理！赶工不得降低质检标准，发现异常仍须如实记录。";
            }

            return QualityAiSuggestionResponse.builder()
                    .orderNo(order.getOrderNo())
                    .styleNo(order.getStyleNo())
                    .styleName(order.getStyleName())
                    .productCategory(order.getProductCategory())
                    .urgent("urgent".equalsIgnoreCase(order.getUrgencyLevel()))
                    .historicalDefectRate(defectRate)
                    .historicalVerdict(verdict)
                    .checkpoints(checkpoints)
                    .defectSuggestions(DEFECT_SUGGESTIONS)
                    .urgentTip(urgentTip)
                    .build();

        } catch (Exception e) {
            log.warn("[QualityAI] JSON解析失败: {}", e.getMessage());
            return null;
        }
    }

    /** 从 AI 文本中提取第一个完整 JSON 对象 */
    private String extractJson(String content) {
        if (!StringUtils.hasText(content)) return null;
        int start = content.indexOf('{');
        int end   = content.lastIndexOf('}');
        return (start >= 0 && end > start) ? content.substring(start, end + 1) : null;
    }

    private String nvl(String val, String def) {
        return StringUtils.hasText(val) ? val : def;
    }

    // ─── 规则引擎兜底（AI不可用时） ──────────────────────────────────

    private QualityAiSuggestionResponse buildFromRules(ProductionOrder order,
                                                        Double historicalDefectRate,
                                                        String historicalVerdict) {
        String category = (order.getProductCategory() == null ? "" : order.getProductCategory().toLowerCase().trim());
        List<String> checkpoints = new ArrayList<>(COMMON_CHECKPOINTS);
        checkpoints.addAll(resolveCategory(category));

        // 历史次品率预警插入头部
        if ("critical".equals(historicalVerdict)) {
            checkpoints.add(0, "🔴 历史次品率>30%，严格全检");
        } else if ("warn".equals(historicalVerdict)) {
            checkpoints.add(0, "🟡 次品率偏高(" + Math.round(historicalDefectRate * 100) + "%)加强抽检");
        }

        // 严格限制总条数≤6条，超出截断
        if (checkpoints.size() > 6) {
            checkpoints = new ArrayList<>(checkpoints.subList(0, 6));
        }

        String urgentTip = null;
        if ("urgent".equalsIgnoreCase(order.getUrgencyLevel())) {
            urgentTip = "⚠️ 急单优先处理，不得降低质检标准";
        }

        return QualityAiSuggestionResponse.builder()
                .orderNo(order.getOrderNo())
                .styleNo(order.getStyleNo())
                .styleName(order.getStyleName())
                .productCategory(order.getProductCategory())
                .urgent("urgent".equalsIgnoreCase(order.getUrgencyLevel()))
                .historicalDefectRate(historicalDefectRate)
                .historicalVerdict(historicalVerdict)
                .checkpoints(checkpoints)
                .defectSuggestions(DEFECT_SUGGESTIONS)
                .urgentTip(urgentTip)
                .build();
    }

    private List<String> resolveCategory(String category) {
        if (!StringUtils.hasText(category)) return Collections.emptyList();
        // 精确匹配
        if (CATEGORY_CHECKPOINTS.containsKey(category)) {
            return CATEGORY_CHECKPOINTS.get(category);
        }
        // 模糊匹配
        for (Map.Entry<String, List<String>> e : CATEGORY_CHECKPOINTS.entrySet()) {
            if (category.contains(e.getKey()) || e.getKey().contains(category)) {
                return e.getValue();
            }
        }
        // 中文关键词匹配
        if (category.contains("衬") || category.contains("shirt")) return CATEGORY_CHECKPOINTS.getOrDefault("shirt", Collections.emptyList());
        if (category.contains("裤") || category.contains("短裤") || category.contains("长裤")) return CATEGORY_CHECKPOINTS.getOrDefault("pants", Collections.emptyList());
        if (category.contains("裙")) return CATEGORY_CHECKPOINTS.getOrDefault("skirt", Collections.emptyList());
        if (category.contains("连衣")) return CATEGORY_CHECKPOINTS.getOrDefault("dress", Collections.emptyList());
        if (category.contains("外套") || category.contains("夹克") || category.contains("大衣") || category.contains("风衣") || category.contains("棉服")) return CATEGORY_CHECKPOINTS.getOrDefault("jacket", Collections.emptyList());
        if (category.contains("T恤") || category.contains("t恤") || category.contains("polo") || category.contains("POLO")) return CATEGORY_CHECKPOINTS.getOrDefault("t-shirt", Collections.emptyList());
        if (category.contains("童")) return CATEGORY_CHECKPOINTS.getOrDefault("kids", Collections.emptyList());
        if (category.contains("婴") || category.contains("幼") || category.contains("baby") || category.contains("infant") || category.contains("新生")) return CATEGORY_CHECKPOINTS.getOrDefault("infant", Collections.emptyList());
        // 面料类型匹配（优先于通用上衣）
        if (category.contains("牛仔") || category.contains("denim") || category.contains("jeans")) return CATEGORY_CHECKPOINTS.getOrDefault("denim", Collections.emptyList());
        if (category.contains("毛衣") || category.contains("针织") || category.contains("sweater") || category.contains("knitwear")) return CATEGORY_CHECKPOINTS.getOrDefault("sweater", Collections.emptyList());
        if (category.contains("真丝") || category.contains("丝绸") || category.contains("silk")) return CATEGORY_CHECKPOINTS.getOrDefault("silk", Collections.emptyList());
        if (category.contains("色丁") || category.contains("缎") || category.contains("satin")) return CATEGORY_CHECKPOINTS.getOrDefault("satin", Collections.emptyList());
        if (category.contains("蕾丝") || category.contains("lace")) return CATEGORY_CHECKPOINTS.getOrDefault("lace", Collections.emptyList());
        if (category.contains("羽绒") || category.contains("down")) return CATEGORY_CHECKPOINTS.getOrDefault("down", Collections.emptyList());
        if (category.contains("雪纺") || category.contains("纱") || category.contains("chiffon")) return CATEGORY_CHECKPOINTS.getOrDefault("chiffon", Collections.emptyList());
        if (category.contains("麻") || category.contains("linen")) return CATEGORY_CHECKPOINTS.getOrDefault("linen", Collections.emptyList());
        // 通用上衣：含"衫"（衬衫已被上面处理）、"卫衣"、"上衣"等
        if (category.contains("衫") || category.contains("卫衣") || category.contains("上衣")) return CATEGORY_CHECKPOINTS.getOrDefault("top", Collections.emptyList());
        return Collections.emptyList();
    }

    private QualityAiSuggestionResponse buildEmpty() {
        return QualityAiSuggestionResponse.builder()
                .checkpoints(COMMON_CHECKPOINTS)
                .defectSuggestions(DEFECT_SUGGESTIONS)
                .historicalVerdict("good")
                .build();
    }
}
