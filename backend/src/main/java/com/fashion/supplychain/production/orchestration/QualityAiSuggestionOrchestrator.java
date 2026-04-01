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
import java.util.stream.Collectors;

/**
 * AI质检建议编排器（#59）
 *
 * <p><b>v2 升级（真实 LLM 驱动）</b>：先读取订单关联的款式信息、BOM 面料成分、工序列表，
 * 构建富含业务上下文的 Prompt，调用 DeepSeek（或 LiteLLM 网关）生成
 * <em>针对这件衣服的个性化质检指引</em>。AI 不可用时自动降级到规则引擎。
 *
 * <p>数据链：订单 → styleId → StyleInfo + BOM + Process → LLM → 结构化 checkpoints
 */
@Service
@Slf4j
public class QualityAiSuggestionOrchestrator {

    private static final ObjectMapper JSON = new ObjectMapper();

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

    /** 通用质检要点（所有品类适用） */
    private static final List<String> COMMON_CHECKPOINTS = Arrays.asList(
        "检查缝线是否均匀、无跳线、断线",
        "检查面料有无色差、污渍、破损",
        "检查各部位对位是否准确（格纹/条纹需对齐）",
        "检查线头是否已全部修剪干净",
        "检查辅料（标签、吊牌、包装袋）是否完整"
    );

    /** 按品类的专属质检要点 */
    private static final Map<String, List<String>> CATEGORY_CHECKPOINTS = new HashMap<>();
    static {
        // 上衣/衬衫
        CATEGORY_CHECKPOINTS.put("shirt", Arrays.asList(
            "检查领口/翻领形态是否端正，左右对称",
            "检查扣眼位置是否均匀，纽扣牢固度测试",
            "检查袖长左右是否一致，袖口折边平整",
            "检查肩缝是否平整，无起拱"
        ));
        CATEGORY_CHECKPOINTS.put("top", Arrays.asList(
            "检查领口/翻领形态是否端正，左右对称",
            "检查袖长左右是否一致，袖口折边平整",
            "检查肩缝是否平整，无起拱"
        ));
        // 裤子
        CATEGORY_CHECKPOINTS.put("pants", Arrays.asList(
            "检查裤长左右是否一致（允差≤0.3cm）",
            "检查裤腰内衬是否平整，无折叠凸起",
            "检查拉链/钮扣开合顺畅，无卡顿",
            "检查两侧口袋对称性及缝线质量"
        ));
        CATEGORY_CHECKPOINTS.put("trousers", CATEGORY_CHECKPOINTS.get("pants"));
        // 裙子
        CATEGORY_CHECKPOINTS.put("skirt", Arrays.asList(
            "检查裙摆下摆是否均匀、平整",
            "检查腰头宽度均匀，松紧适度",
            "检查拉链或暗扣安装是否平整"
        ));
        // 连衣裙
        CATEGORY_CHECKPOINTS.put("dress", Arrays.asList(
            "检查整衣上下比例，腰线定位准确",
            "检查领口和下摆工整度",
            "检查拉链/扣子位置对称，开合顺畅",
            "检查里布与面料贴合，无起皱"
        ));
        // 外套/夹克
        CATEGORY_CHECKPOINTS.put("jacket", Arrays.asList(
            "检查领子造型端正，驳头左右对称",
            "检查拉链/扣子功能完好，开合流畅",
            "检查口袋盖对称，缝制平整",
            "检查里衬与面料无脱层，整体挺括"
        ));
        CATEGORY_CHECKPOINTS.put("coat", CATEGORY_CHECKPOINTS.get("jacket"));
        CATEGORY_CHECKPOINTS.put("outerwear", CATEGORY_CHECKPOINTS.get("jacket"));
        // T恤
        CATEGORY_CHECKPOINTS.put("t-shirt", Arrays.asList(
            "检查领圈缝线牢固，领口弹性均匀",
            "检查印花/绣花位置居中，无脱色",
            "检查下摆折边均匀，宽窄一致"
        ));
        CATEGORY_CHECKPOINTS.put("tshirt", CATEGORY_CHECKPOINTS.get("t-shirt"));
        // 童装
        CATEGORY_CHECKPOINTS.put("kids", Arrays.asList(
            "严查小部件（纽扣、装饰件）牢固度，防脱落吞食风险",
            "检查面料手感柔软，无刺激性材质",
            "检查拉链头需有防夹手设计",
            "检查成品尺寸是否符合童装尺码标准"
        ));
    }

    /** 按次品类别的AI建议（可直接采纳为返修备注） */
    private static final Map<String, String> DEFECT_SUGGESTIONS = new LinkedHashMap<>();
    static {
        DEFECT_SUGGESTIONS.put("appearance_integrity",
            "外观完整性问题：检查起毛、破洞、抽丝部位，轻微可手工修补；严重需重新缝制。建议追溯该批次面料来源，若批量出现请及时反馈供应商。");
        DEFECT_SUGGESTIONS.put("size_accuracy",
            "尺寸精度问题：先核对裁床版型是否偏差，若版型无误则为缝制拉伸导致。可尝试蒸汽定型回正；若尺差>1cm建议报废重做，避免客退。");
        DEFECT_SUGGESTIONS.put("process_compliance",
            "工艺规范性问题：对照工艺单检查各步骤执行情况，重点核查缝份宽度、针距设置。建议组织工艺培训，对该工人本批次产品全检。");
        DEFECT_SUGGESTIONS.put("functional_effectiveness",
            "功能有效性问题：检查拉链/扣子/魔术贴等功能件更换或加固。功能性问题直接影响客户体验，建议同批次产品全部复检，不合格件一律返修。");
        DEFECT_SUGGESTIONS.put("other",
            "其他问题：请详细记录异常情况，拍照留档后交由品控主管确认处理方案。若为批量性问题请立即上报避免流入后续工序。");
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

        // 2. 历史次品率（已有质检记录）
        Double historicalDefectRate = null;
        String historicalVerdict = "good";
        try {
            List<ProductWarehousing> records = productWarehousingService.list(
                new LambdaQueryWrapper<ProductWarehousing>()
                    .eq(ProductWarehousing::getOrderId, orderId.trim())
                    .eq(ProductWarehousing::getDeleteFlag, 0)
            );
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

        // 3. 优先走真实 LLM（读取款式/BOM/工序 → DeepSeek 生成个性化质检指引）
        if (inferenceOrchestrator.isAnyModelEnabled()) {
            try {
                QualityAiSuggestionResponse llmResult = callLLM(order, historicalDefectRate, historicalVerdict);
                if (llmResult != null) {
                    log.info("[QualityAI] LLM生成质检指引成功: orderId={}, checkpoints={}", orderId, llmResult.getCheckpoints().size());
                    return llmResult;
                }
            } catch (Exception e) {
                log.warn("[QualityAI] LLM调用失败，降级规则引擎: orderId={}, err={}", orderId, e.getMessage());
            }
        }

        // 4. 规则引擎兜底
        return buildFromRules(order, historicalDefectRate, historicalVerdict);
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
        return "你是一名拥有10年经验的服装品控专家AI助手。\n" +
               "任务：根据用户提供的真实订单数据（品类、面料成分、BOM物料、工序），" +
               "生成一份「专门针对这件衣服」的质检清单。\n\n" +
               "要求：\n" +
               "1. 每条要点必须具体、可执行，结合实际面料特性和工序难点（禁止输出【检查总体质量】这类废话）\n" +
               "2. 面料层面：针对具体材质（雪纺/纯棉/弹力布/聚酯等）的检验要点\n" +
               "3. 工序层面：高难度/高风险工序的特别关注点\n" +
               "4. 历史次品率高时，要在要点中指明重点排查区域\n" +
               "5. 输出「纯JSON」，不要任何多余文字\n\n" +
               "输出格式：\n" +
               "{\"checkpoints\":[\"要点1\",\"要点2\",...],\"urgentTip\":\"急单提示或null\",\"specialRisks\":\"本款特殊风险一句话\"}";
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

        sb.append("\n请基于以上真实数据，生成 8~12 条具体质检要点（JSON格式）。");
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

        String urgentTip = null;
        if ("urgent".equalsIgnoreCase(order.getUrgencyLevel())) {
            urgentTip = "⚠️ 此为急单，请优先处理！注意：赶工不得降低质检标准，发现异常仍需如实记录。";
        }

        if ("critical".equals(historicalVerdict)) {
            checkpoints.add(0, "🔴 此订单历史次品率超30%，请严格全检，重点关注批次一致性");
        } else if ("warn".equals(historicalVerdict)) {
            checkpoints.add(0, "🟡 此订单历史次品率偏高(" + Math.round(historicalDefectRate * 100) + "%)，需加强抽检力度");
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
        // 通用上衣：含"衫"（显头衫、衬衫已被上面处理）、"毛衣"、"卫衣"、"上衣"等
        if (category.contains("衫") || category.contains("毛衣") || category.contains("卫衣") || category.contains("上衣") || category.contains("针织")) return CATEGORY_CHECKPOINTS.getOrDefault("top", Collections.emptyList());
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
