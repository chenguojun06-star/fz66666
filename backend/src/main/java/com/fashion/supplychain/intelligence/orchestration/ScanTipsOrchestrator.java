package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.dto.AiScanTipResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.style.service.StyleBomService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 扫码阶段智能提示编排器
 * 根据当前扫码阶段（采购/裁剪/车缝/尾部/质检/入库）+ 真实BOM面辅料数据
 * 生成≤2句精准提示，气泡形式展示，可关闭
 *
 * 核心原则：基于这个款的实际面辅料/工序/工艺，精准、少、专业
 */
@Service
@Slf4j
public class ScanTipsOrchestrator {

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private StyleInfoMapper styleInfoMapper;

    @Autowired
    private StyleBomService styleBomService;

    public AiScanTipResponse getScanTips(String orderNo, String processName) {
        AiScanTipResponse response = new AiScanTipResponse();
        response.setOrderNo(orderNo);
        response.setProcessName(processName);
        response.setKeywords(new ArrayList<>());
        response.setDismissible(true);

        if (!StringUtils.hasText(orderNo)) {
            return response;
        }

        ProductionOrder order = productionOrderMapper.selectOne(
            new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getOrderNo, orderNo)
                .select(ProductionOrder::getId, ProductionOrder::getOrderNo,
                        ProductionOrder::getStyleNo, ProductionOrder::getStyleName,
                        ProductionOrder::getRemarks, ProductionOrder::getUrgencyLevel,
                        ProductionOrder::getProductCategory, ProductionOrder::getHasSecondaryProcess)
        );
        if (order == null) return response;

        StyleInfo style = loadStyle(order.getStyleNo());
        List<String> fabricTypes = loadBomFabricTypes(style);
        String productionDesc = style != null ? nvl(style.getDescription(), "") : "";
        List<String> processKeywords = extractProcessKeywords(productionDesc);

        // 根据进度阶段生成专属提示
        String stage = resolveStage(processName);
        response.setStage(stage);

        StringBuilder tip = new StringBuilder();
        List<String> keywords = new ArrayList<>();
        String priority = "medium";

        // —— 基于BOM真实面料的精准提示（每阶段1句） ——
        String fabricTip = buildFabricTipForStage(stage, fabricTypes, style);
        if (fabricTip != null) {
            tip.append(fabricTip);
            priority = "high";
        }

        // —— 基于工艺制单的工序精准提示 ——
        String processTip = buildProcessTipForStage(stage, processKeywords, productionDesc);
        if (processTip != null) {
            tip.append(processTip);
            if (!"high".equals(priority)) priority = "high";
        }

        // —— 阶段专属提示（1句，不重复面料内容） ——
        switch (stage) {
            case "采购":
                appendProcurementTips(tip, keywords, order, style);
                break;
            case "裁剪":
                appendCuttingTips(tip, keywords, order, style, fabricTypes);
                break;
            case "车缝":
                appendSewingTips(tip, keywords, order, style, processName);
                break;
            case "尾部":
                appendTailTips(tip, keywords, order, fabricTypes);
                break;
            case "质检":
                appendQualityTips(tip, keywords, order, style, fabricTypes);
                priority = "high";
                break;
            case "入库":
                appendWarehouseTips(tip, keywords, order, fabricTypes);
                break;
            default:
                appendGenericTips(tip, keywords, order, processName);
                break;
        }

        // 急单标记
        if ("urgent".equalsIgnoreCase(order.getUrgencyLevel())) {
            keywords.add(0, "急单");
            priority = "high";
        }

        // 生产备注（仅截取前25字）
        if (StringUtils.hasText(order.getRemarks())) {
            String remark = order.getRemarks().length() > 25
                ? order.getRemarks().substring(0, 25) + "…" : order.getRemarks();
            tip.append("📋 ").append(remark);
        }

        String aiTip = tip.toString().trim();
        if (StringUtils.hasText(aiTip)) {
            response.setAiTip(aiTip);
        }
        response.setKeywords(keywords);
        response.setPriority(priority);

        return response;
    }

    // ─── 阶段识别 ──────────────────────────────

    private String resolveStage(String processName) {
        if (!StringUtils.hasText(processName)) return "";
        String p = processName.toLowerCase();
        if (p.contains("采购") || p.contains("面料") || p.contains("辅料") || p.contains("配料")) return "采购";
        if (p.contains("裁") || p.contains("cutting") || p.contains("裁床")) return "裁剪";
        if (p.contains("车缝") || p.contains("缝") || p.contains("sewing") || p.contains("车位")) return "车缝";
        if (p.contains("尾") || p.contains("整烫") || p.contains("包装") || p.contains("剪线")) return "尾部";
        if (p.contains("质检") || p.contains("验收") || p.contains("quality") || p.contains("检验")) return "质检";
        if (p.contains("入库") || p.contains("仓") || p.contains("warehouse")) return "入库";
        return "";
    }

    // ─── 面料特性分析（基于真实BOM数据） ──────────────────────────────

    /**
     * 从BOM加载真实面辅料类型关键词（如silk/denim/lace等）
     */
    private List<String> loadBomFabricTypes(StyleInfo style) {
        if (style == null || style.getId() == null) return Collections.emptyList();
        try {
            List<StyleBom> bomList = styleBomService.listByStyleId(style.getId());
            if (bomList == null || bomList.isEmpty()) return Collections.emptyList();
            // 拼接所有BOM的materialName + fabricComposition 用于面料识别
            String allText = bomList.stream()
                .map(b -> nvl(b.getMaterialName(), "") + " " + nvl(b.getFabricComposition(), ""))
                .collect(Collectors.joining(" ")).toLowerCase();
            List<String> types = new ArrayList<>();
            if (allText.contains("真丝") || allText.contains("丝绸") || allText.contains("silk")) types.add("silk");
            if (allText.contains("雪纺") || allText.contains("chiffon")) types.add("chiffon");
            if (allText.contains("蕾丝") || allText.contains("lace")) types.add("lace");
            if (allText.contains("色丁") || allText.contains("缎") || allText.contains("satin")) types.add("satin");
            if (allText.contains("牛仔") || allText.contains("denim")) types.add("denim");
            if (allText.contains("针织") || allText.contains("毛衣") || allText.contains("knitwear")) types.add("knitwear");
            if (allText.contains("羽绒") || allText.contains("down")) types.add("down");
            if (allText.contains("麻") || allText.contains("linen")) types.add("linen");
            if (allText.contains("皮") || allText.contains("pu") || allText.contains("leather")) types.add("leather");
            if (allText.contains("弹力") || allText.contains("莱卡") || allText.contains("spandex")) types.add("stretch");
            if (allText.contains("格") || allText.contains("条纹") || allText.contains("plaid") || allText.contains("stripe")) types.add("pattern");
            if (allText.contains("绒") || allText.contains("灯芯绒") || allText.contains("corduroy")) types.add("velvet");
            return types;
        } catch (Exception e) {
            log.warn("[ScanTips] 加载BOM面料失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    private String nvl(String val, String def) {
        return StringUtils.hasText(val) ? val : def;
    }

    /**
     * 根据阶段+真实面料类型，返回1句面料相关的精准提示
     * 不同阶段关注面料的不同特性
     */
    private String buildFabricTipForStage(String stage, List<String> fabricTypes, StyleInfo style) {
        if (fabricTypes.isEmpty()) {
            // 兜底：从StyleInfo.fabricComposition识别
            return analyzeFabricFallback(style);
        }
        // 按优先级返回最重要的1条面料提示
        switch (stage) {
            case "裁剪":
                if (fabricTypes.contains("silk") || fabricTypes.contains("chiffon"))
                    return "🔴 真丝/雪纺易滑移，单层裁剪+重物压稳\n";
                if (fabricTypes.contains("pattern"))
                    return "🔴 格纹/条纹面料必须对格对条裁剪\n";
                if (fabricTypes.contains("denim"))
                    return "🟡 牛仔面料注意经纬向，预缩后再裁\n";
                if (fabricTypes.contains("knitwear"))
                    return "🟡 针织面料放松量+1cm，防卷边\n";
                if (fabricTypes.contains("linen"))
                    return "🟡 麻料预缩必做，裁后及时码齐\n";
                if (fabricTypes.contains("velvet"))
                    return "🟡 绒面料统一倒毛方向裁剪\n";
                break;
            case "车缝":
                if (fabricTypes.contains("silk") || fabricTypes.contains("satin"))
                    return "🔴 丝/缎面料放慢车速，用特氟龙压脚防滑丝\n";
                if (fabricTypes.contains("leather"))
                    return "🔴 皮料不可返工，车错留针孔，一步到位\n";
                if (fabricTypes.contains("lace"))
                    return "🟡 蕾丝车缝沿花型走，接缝自然对花\n";
                if (fabricTypes.contains("knitwear") || fabricTypes.contains("stretch"))
                    return "🟡 弹力面料用弹性缝线，松量控制防变形\n";
                if (fabricTypes.contains("denim"))
                    return "🟡 牛仔用粗线大针距，铆钉要牢固\n";
                if (fabricTypes.contains("chiffon"))
                    return "🔴 雪纺易抽丝，缝边必须锁边处理\n";
                break;
            case "尾部":
                if (fabricTypes.contains("silk") || fabricTypes.contains("satin"))
                    return "🔴 丝/缎面料低温整烫≤120°C，垫布操作\n";
                if (fabricTypes.contains("down"))
                    return "🟡 羽绒服检查充绒均匀，不钻绒\n";
                if (fabricTypes.contains("knitwear"))
                    return "🟡 针织成品蒸汽定型，检查缩水回弹\n";
                if (fabricTypes.contains("denim"))
                    return "🟡 牛仔洗水后核对色差和缩率\n";
                if (fabricTypes.contains("linen"))
                    return "🟡 麻料整烫温度≤180°C，防泛黄\n";
                break;
            case "质检":
                if (fabricTypes.contains("silk") || fabricTypes.contains("chiffon") || fabricTypes.contains("satin"))
                    return "🔴 轻柔面料重点检查抽丝/勾丝/水渍\n";
                if (fabricTypes.contains("denim"))
                    return "🔴 牛仔检查色差和擦洗色牢度\n";
                if (fabricTypes.contains("down"))
                    return "🔴 羽绒揉压检测不渗绒，称重核对充绒量\n";
                if (fabricTypes.contains("leather"))
                    return "🔴 皮料检查针孔/划痕，不可修复\n";
                if (fabricTypes.contains("knitwear"))
                    return "🟡 针织检查起球/脱线/罗口弹性\n";
                break;
            case "入库":
                if (fabricTypes.contains("silk") || fabricTypes.contains("satin") || fabricTypes.contains("chiffon"))
                    return "🟡 丝质面料避光防潮存放，禁折叠挤压\n";
                if (fabricTypes.contains("leather"))
                    return "🟡 皮料挂装存放，防变形起皱\n";
                if (fabricTypes.contains("down"))
                    return "🟡 羽绒服勿真空压缩，蓬松度保存\n";
                break;
            case "采购":
                if (fabricTypes.contains("silk") || fabricTypes.contains("chiffon"))
                    return "🟡 丝质面料到货后抽检色差/勾丝\n";
                if (fabricTypes.contains("denim"))
                    return "🟡 牛仔面料核对预缩率和色号批次\n";
                if (fabricTypes.contains("pattern"))
                    return "🟡 格纹/条纹面料核对花型循环尺寸\n";
                break;
            default:
                break;
        }
        return null;
    }

    /** BOM数据为空时的兜底面料分析（从款名/成分文本猜测） */
    private String analyzeFabricFallback(StyleInfo style) {
        if (style == null) return null;
        String text = nvl(style.getStyleName(), "") + " " + nvl(style.getFabricComposition(), "");
        String lower = text.toLowerCase();
        if (lower.contains("真丝") || lower.contains("silk")) return "🔴 真丝面料轻拿轻放\n";
        if (lower.contains("皮") || lower.contains("leather")) return "🔴 皮料不可返工\n";
        if (lower.contains("针织") || lower.contains("弹力")) return "🟡 弹力面料注意松量\n";
        return null;
    }

    // ─── 各阶段专属提示 ──────────────────────────────

    private void appendProcurementTips(StringBuilder tip, List<String> keywords,
                                       ProductionOrder order, StyleInfo style) {
        keywords.add("面辅料");
        if (hasSecondaryProcess(order)) {
            tip.append("💡 含二次工艺，确认洗水/印花/绣花物料齐备\n");
            keywords.add("二次工艺");
        }
        if (isChildrenWear(order)) {
            tip.append("🔴 童装配饰拉力≥70N，绳带≤7.5cm\n");
            keywords.add("童装安全");
        }
    }

    private void appendCuttingTips(StringBuilder tip, List<String> keywords,
                                   ProductionOrder order, StyleInfo style,
                                   List<String> fabricTypes) {
        keywords.add("裁剪");
        // BOM已给了面料相关提示，这里补充通用要点
        tip.append("💡 核对色号批次一致，防止色差混裁\n");
    }

    private void appendSewingTips(StringBuilder tip, List<String> keywords,
                                  ProductionOrder order, StyleInfo style, String processName) {
        keywords.add("车缝");
        if (StringUtils.hasText(processName)) {
            if (processName.contains("袖") || processName.contains("领")) {
                tip.append("🔴 关键工序：注意左右对称及平整度\n");
            }
            if (processName.contains("拉链") || processName.contains("zipper")) {
                tip.append("💡 拉链安装需顺滑，拉合3次验证\n");
            }
        }
        // 样衣审核意见传递
        if (style != null && StringUtils.hasText(style.getSampleReviewComment())) {
            String review = style.getSampleReviewComment();
            String short_ = review.length() > 25 ? review.substring(0, 25) + "…" : review;
            tip.append("📋 样衣审核：").append(short_).append("\n");
        }
    }

    private void appendTailTips(StringBuilder tip, List<String> keywords,
                                ProductionOrder order, List<String> fabricTypes) {
        keywords.add("尾部");
        tip.append("💡 线头剪净，整烫温度匹配面料\n");
        if (hasSecondaryProcess(order)) {
            tip.append("🟡 含二次工艺，检查洗水/印花效果\n");
        }
    }

    private void appendQualityTips(StringBuilder tip, List<String> keywords,
                                   ProductionOrder order, StyleInfo style,
                                   List<String> fabricTypes) {
        keywords.add("质检");
        if (isChildrenWear(order)) {
            tip.append("🔴 童装：小部件/绳带/甲醛必检\n");
            keywords.add("童装安全");
        }
        tip.append("💡 重点检查面料+车缝+配饰三方向\n");
    }

    private void appendWarehouseTips(StringBuilder tip, List<String> keywords,
                                     ProductionOrder order, List<String> fabricTypes) {
        keywords.add("入库");
        tip.append("💡 核对数量与装箱单一致，抽检外观\n");
    }

    private void appendGenericTips(StringBuilder tip, List<String> keywords,
                                   ProductionOrder order, String processName) {
        if (StringUtils.hasText(processName)) {
            keywords.add(processName);
        }
    }

    // ─── 工具方法 ──────────────────────────────

    private StyleInfo loadStyle(String styleNo) {
        if (!StringUtils.hasText(styleNo)) return null;
        return styleInfoMapper.selectOne(
            new LambdaQueryWrapper<StyleInfo>()
                .eq(StyleInfo::getStyleNo, styleNo)
                .select(StyleInfo::getId, StyleInfo::getStyleNo, StyleInfo::getStyleName,
                        StyleInfo::getFabricComposition, StyleInfo::getSampleReviewComment,
                        StyleInfo::getDescription)
                .last("LIMIT 1")
        );
    }

    // ─── 工艺制单工序关键词提取 ──────────────────────────────

    private List<String> extractProcessKeywords(String description) {
        if (!StringUtils.hasText(description)) return Collections.emptyList();
        List<String> keywords = new ArrayList<>();
        String lower = description.toLowerCase();
        if (lower.contains("印花") || lower.contains("print")) keywords.add("印花");
        if (lower.contains("绣花") || lower.contains("embroid") || lower.contains("刺绣")) keywords.add("绣花");
        if (lower.contains("洗水") || lower.contains("wash") || lower.contains("水洗")) keywords.add("洗水");
        if (lower.contains("压褶") || lower.contains("pleat")) keywords.add("压褶");
        if (lower.contains("复合") || lower.contains("贴合") || lower.contains("laminate")) keywords.add("复合");
        if (lower.contains("植绒") || lower.contains("flock")) keywords.add("植绒");
        if (lower.contains("烫金") || lower.contains("烫银") || lower.contains("foil")) keywords.add("烫金");
        if (lower.contains("激光") || lower.contains("laser")) keywords.add("激光切割");
        if (lower.contains("包边") || lower.contains("bind")) keywords.add("包边");
        if (lower.contains("打枣") || lower.contains("bar tack")) keywords.add("打枣");
        if (lower.contains("锁眼") || lower.contains("buttonhole")) keywords.add("锁眼");
        if (lower.contains("钉扣") || lower.contains("button")) keywords.add("钉扣");
        return keywords;
    }

    private String buildProcessTipForStage(String stage, List<String> processKeywords, String description) {
        if (processKeywords.isEmpty()) return null;
        switch (stage) {
            case "采购":
                if (processKeywords.contains("印花"))
                    return "🔴 印花工序：确认花型版与样衣一致，到料核对颜色牢度\n";
                if (processKeywords.contains("绣花"))
                    return "🔴 绣花工序：确认绣花版/线色卡，到料核对绣线色号\n";
                if (processKeywords.contains("洗水"))
                    return "🟡 洗水工序：确认洗水配方和助剂齐备\n";
                break;
            case "裁剪":
                if (processKeywords.contains("印花"))
                    return "🔴 印花工序注意：核对花型位置与样衣一致，控制印花温度150-160℃，确保图案无错位、无漏印\n";
                if (processKeywords.contains("绣花"))
                    return "🔴 绣花工序注意：核对绣花位置与样衣一致，检查线色/密度/针迹，防止跳线断线\n";
                if (processKeywords.contains("激光切割"))
                    return "🔴 激光切割：注意切割边缘熔融，需冷却后分拣\n";
                break;
            case "车缝":
                if (processKeywords.contains("印花"))
                    return "🔴 印花部位车缝：沿印花边缘走线，避免缝穿图案\n";
                if (processKeywords.contains("绣花"))
                    return "🔴 绣花部位车缝：避开绣花区域1-2mm，防止绣线脱散\n";
                if (processKeywords.contains("包边"))
                    return "🟡 包边工序：包边条宽度均匀，转角处平整不起皱\n";
                if (processKeywords.contains("打枣"))
                    return "🟡 打枣位置按制单标注，加固受力点\n";
                break;
            case "尾部":
                if (processKeywords.contains("洗水"))
                    return "🔴 洗水工序：严格按洗水配方执行，核对洗后效果与样衣一致\n";
                if (processKeywords.contains("压褶"))
                    return "🔴 压褶工序：温度/压力/时间按制单参数，褶型与样衣一致\n";
                if (processKeywords.contains("烫金"))
                    return "🔴 烫金/烫银：控制温度和压力，检查附着力与光泽度\n";
                break;
            case "质检":
                if (processKeywords.contains("印花"))
                    return "🔴 印花质检：核对花型位置/颜色/对位，无错位漏印色差\n";
                if (processKeywords.contains("绣花"))
                    return "🔴 绣花质检：检查针迹密度/线色/位置，无跳线断线浮线\n";
                if (processKeywords.contains("洗水"))
                    return "🔴 洗水质检：核对洗后手感/色差/缩率与样衣一致\n";
                if (processKeywords.contains("植绒"))
                    return "🔴 植绒质检：摩擦测试不脱落，绒面均匀无斑驳\n";
                break;
            case "入库":
                if (processKeywords.contains("印花") || processKeywords.contains("烫金"))
                    return "🟡 印花/烫金部位避免叠压摩擦，防止图案磨损\n";
                if (processKeywords.contains("压褶"))
                    return "🟡 压褶服装挂装存放，防褶型变形\n";
                break;
            default:
                break;
        }
        return null;
    }

    private boolean hasSecondaryProcess(ProductionOrder order) {
        return Boolean.TRUE.equals(order.getHasSecondaryProcess());
    }

    private boolean isChildrenWear(ProductionOrder order) {
        String cat = order.getProductCategory();
        if (!StringUtils.hasText(cat)) return false;
        String lower = cat.toLowerCase();
        return lower.contains("童") || lower.contains("婴") || lower.contains("幼")
            || lower.contains("kids") || lower.contains("infant") || lower.contains("baby");
    }
}
