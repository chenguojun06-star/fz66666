package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.dto.QualityAiSuggestionResponse;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.stream.Collectors;

/**
 * AI质检建议编排器（#59）
 * 基于订单品类、工厂历史次品率、急单状态，生成
 *   ① 质检要点列表（通用 + 品类专属）
 *   ② 按异常类别的返修/处理建议
 *   ③ 历史次品率风险提示
 *
 * 纯规则引擎，无外部AI调用，毫秒响应
 */
@Service
@Slf4j
public class QualityAiSuggestionOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

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

        // 2. 历史次品率（同订单已有质检记录）
        Double historicalDefectRate = null;
        String historicalVerdict = "good";
        try {
            List<ProductWarehousing> records = productWarehousingService.list(
                new LambdaQueryWrapper<ProductWarehousing>()
                    .eq(ProductWarehousing::getOrderId, orderId.trim())
                    .eq(ProductWarehousing::getDeleteFlag, 0)
            );
            if (!records.isEmpty()) {
                int totalQ = records.stream().mapToInt(r -> r.getQualifiedQuantity() == null ? 0 : r.getQualifiedQuantity()).sum();
                int totalUQ = records.stream().mapToInt(r -> r.getUnqualifiedQuantity() == null ? 0 : r.getUnqualifiedQuantity()).sum();
                int processed = totalQ + totalUQ;
                if (processed > 0) {
                    historicalDefectRate = (double) totalUQ / processed;
                    if (historicalDefectRate > 0.30) historicalVerdict = "critical";
                    else if (historicalDefectRate > 0.15) historicalVerdict = "warn";
                }
            }
        } catch (Exception e) {
            log.warn("[QualityAI] 历史数据查询失败: orderId={}", orderId, e);
        }

        // 3. 组合质检要点（通用 + 品类专属）
        String category = (order.getProductCategory() == null ? "" : order.getProductCategory().toLowerCase().trim());
        List<String> checkpoints = new ArrayList<>(COMMON_CHECKPOINTS);
        List<String> categoryTips = resolveCategory(category);
        checkpoints.addAll(categoryTips);

        // 4. 急单提示
        String urgentTip = null;
        if ("urgent".equalsIgnoreCase(order.getUrgencyLevel())) {
            urgentTip = "⚠️ 此为急单，请优先处理！注意：赶工不得降低质检标准，发现异常仍需如实记录。";
        }

        // 5. 历史次品率风险提示（融入要点）
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
                .isUrgent("urgent".equalsIgnoreCase(order.getUrgencyLevel()))
                .historicalDefectRate(historicalDefectRate)
                .historicalVerdict(historicalVerdict)
                .checkpoints(checkpoints)
                .defectSuggestions(DEFECT_SUGGESTIONS)
                .urgentTip(urgentTip)
                .build();
    }

    // ─── 私有方法 ──────────────────────────────────────────────────────

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
