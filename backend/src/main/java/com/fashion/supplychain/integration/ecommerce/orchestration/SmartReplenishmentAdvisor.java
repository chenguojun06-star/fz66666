package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcPurchaseSuggestion;
import com.fashion.supplychain.integration.ecommerce.entity.EcStockAlert;
import com.fashion.supplychain.integration.ecommerce.service.EcPurchaseSuggestionService;
import com.fashion.supplychain.integration.ecommerce.service.EcStockAlertService;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.service.TenantService;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * 智能补货顾问（Phase 1：聚水潭对标核心差异化）
 *
 * <p>核心价值：缺货预警时 AI 判断走"采购"还是"生产"，并给出推理依据和置信度。
 * 区别于聚水潭的纯规则补货建议，本顾问：
 * <ol>
 *   <li>基于租户类型（SELF_FACTORY/HYBRID/BRAND）+ 款式 BOM 数据自动分流</li>
 *   <li>AI 透明化推理，给出置信度和理由，<70% 标黄强制人工确认</li>
 *   <li>HYBRID 租户按款式粒度判断：有完整 BOM 走生产，无 BOM 走采购</li>
 * </ol>
 *
 * <p>所有决策都是"建议"：生成 EcPurchaseSuggestion(status=0 PENDING)，人工确认后才执行。</p>
 */
@Slf4j
@Service
@Lazy
public class SmartReplenishmentAdvisor {

    @Autowired @Lazy private EcStockAlertService stockAlertService;
    @Autowired @Lazy private EcPurchaseSuggestionService suggestionService;
    @Autowired @Lazy private StyleBomService styleBomService;
    @Autowired @Lazy private StyleInfoService styleInfoService;
    @Autowired @Lazy private ProductSkuService productSkuService;
    @Autowired @Lazy private TenantService tenantService;
    @Autowired @Lazy private ProductionOrderService productionOrderService;
    @Autowired @Lazy private AiInferenceGateway aiInferenceGateway;

    @Value("${fashion.ecommerce.replenishment.scene:replenishment_advisor}")
    private String aiScene;

    /** 建议类型：采购 */
    public static final String TYPE_PURCHASE = "PURCHASE";
    /** 建议类型：生产 */
    public static final String TYPE_PRODUCTION = "PRODUCTION";

    /**
     * 扫描未处理预警，为每条生成 AI 补货建议（不执行，仅生成 PENDING 建议待人工确认）
     *
     * @return 本次新生成的建议数量
     */
    public int scanAndAdvise() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<EcStockAlert> unresolved = stockAlertService.listUnresolved(tenantId);
        if (unresolved.isEmpty()) {
            return 0;
        }

        Tenant tenant = tenantService.getById(tenantId);
        String tenantType = tenant != null && tenant.getTenantType() != null
                ? tenant.getTenantType() : "HYBRID";

        int created = 0;
        for (EcStockAlert alert : unresolved) {
            // 已存在 PENDING 建议则跳过，避免重复
            if (hasPendingSuggestion(tenantId, alert.getSkuId())) {
                continue;
            }
            try {
                ReplenishmentAdvice advice = evaluateAlert(alert, tenantType);
                if (advice != null) {
                    persistSuggestion(alert, advice);
                    created++;
                }
            } catch (Exception e) {
                log.warn("[SmartReplenishment] 评估失败 alertId={} skuCode={}: {}",
                        alert.getId(), alert.getSkuCode(), e.getMessage());
            }
        }
        log.info("[SmartReplenishment] 扫描完成 tenantId={} alerts={} newSuggestions={}",
                tenantId, unresolved.size(), created);
        return created;
    }

    /**
     * 评估单条预警，决定走采购还是生产
     */
    public ReplenishmentAdvice evaluateAlert(EcStockAlert alert, String tenantType) {
        // 1. 收集上下文
        StyleInfo style = resolveStyle(alert.getStyleId());
        ProductSku sku = resolveSku(alert.getSkuId());
        boolean hasBom = alert.getStyleId() != null
                && !styleBomService.listByStyleId(alert.getStyleId()).isEmpty();
        Integer onWayProduction = queryOnWayProduction(alert.getStyleId());
        Integer targetQty = computeTargetQuantity(alert);

        // 2. 规则预判（无 AI 也能给出基础建议）
        String ruleBasedType = ruleBasedDispatch(tenantType, hasBom);

        // 3. AI 增强决策（透明化推理）
        AiVerdict ai = callAiForVerdict(alert, style, sku, tenantType, hasBom,
                onWayProduction, targetQty, ruleBasedType);

        ReplenishmentAdvice advice = new ReplenishmentAdvice();
        advice.setSuggestionType(ai != null && ai.type != null ? ai.type : ruleBasedType);
        advice.setSuggestQuantity(targetQty);
        advice.setAiConfidence(ai != null ? ai.confidence : 60);
        advice.setAiReason(ai != null ? ai.reason : buildFallbackReason(tenantType, hasBom));
        advice.setUrgencyLevel(alert.getSafeStock() != null && alert.getCurrentStock() != null
                && alert.getCurrentStock() < alert.getSafeStock() / 2 ? "HIGH" : "MEDIUM");
        return advice;
    }

    /** 规则预判：HYBRID 按 BOM 分流；SELF_FACTORY 默认生产；BRAND 默认采购 */
    private String ruleBasedDispatch(String tenantType, boolean hasBom) {
        if ("SELF_FACTORY".equals(tenantType)) return TYPE_PRODUCTION;
        if ("BRAND".equals(tenantType)) return TYPE_PURCHASE;
        // HYBRID：有 BOM 走生产，无 BOM 走采购
        return hasBom ? TYPE_PRODUCTION : TYPE_PURCHASE;
    }

    /** AI 增强决策：调用小云AI，返回 type/confidence/reason；失败返回 null 走规则兜底 */
    private AiVerdict callAiForVerdict(EcStockAlert alert, StyleInfo style, ProductSku sku,
                                       String tenantType, boolean hasBom,
                                       Integer onWayProduction, Integer targetQty,
                                       String ruleBasedType) {
        if (aiInferenceGateway == null) return null;
        String prompt = buildPrompt(alert, style, sku, tenantType, hasBom,
                onWayProduction, targetQty, ruleBasedType);
        try {
            IntelligenceInferenceResult res = aiInferenceGateway.chat(
                    aiScene,
                    "你是服装供应链补货顾问。判断缺货应走采购还是生产，返回 JSON："
                    + "{\"type\":\"PURCHASE|PRODUCTION\",\"confidence\":0-100,\"reason\":\"简短理由\"}。",
                    prompt);
            if (res == null || !res.isSuccess() || res.getContent() == null) {
                return null;
            }
            return parseAiVerdict(res.getContent());
        } catch (Exception e) {
            log.warn("[SmartReplenishment] AI 调用失败，走规则兜底: {}", e.getMessage());
            return null;
        }
    }

    private String buildPrompt(EcStockAlert alert, StyleInfo style, ProductSku sku,
                               String tenantType, boolean hasBom,
                               Integer onWayProduction, Integer targetQty,
                               String ruleBasedType) {
        StringBuilder sb = new StringBuilder();
        sb.append("租户类型: ").append(tenantType).append("\n");
        sb.append("款号: ").append(style != null ? style.getStyleNo() : "-").append("\n");
        sb.append("SKU: ").append(alert.getSkuCode()).append("\n");
        sb.append("当前库存: ").append(alert.getCurrentStock()).append("\n");
        sb.append("安全库存: ").append(alert.getSafeStock()).append("\n");
        sb.append("是否有BOM: ").append(hasBom).append("\n");
        sb.append("在产数量: ").append(onWayProduction != null ? onWayProduction : 0).append("\n");
        sb.append("建议补货量: ").append(targetQty).append("\n");
        sb.append("规则预判: ").append(ruleBasedType).append("\n");
        sb.append("请综合判断应走采购还是生产，给出置信度和理由。");
        return sb.toString();
    }

    private AiVerdict parseAiVerdict(String content) {
        if (content == null) return null;
        // 容错提取 JSON
        int start = content.indexOf('{');
        int end = content.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        String json = content.substring(start, end + 1);
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.JsonNode node = mapper.readTree(json);
            AiVerdict v = new AiVerdict();
            v.type = node.has("type") ? node.get("type").asText() : null;
            v.confidence = node.has("confidence") ? node.get("confidence").asInt() : 60;
            v.reason = node.has("reason") ? node.get("reason").asText() : null;
            if (!TYPE_PURCHASE.equals(v.type) && !TYPE_PRODUCTION.equals(v.type)) {
                v.type = TYPE_PURCHASE;
            }
            return v;
        } catch (Exception e) {
            log.warn("[SmartReplenishment] AI 返回解析失败: {}", e.getMessage());
            return null;
        }
    }

    private String buildFallbackReason(String tenantType, boolean hasBom) {
        if ("SELF_FACTORY".equals(tenantType)) return "自有工厂租户，优先走生产";
        if ("BRAND".equals(tenantType)) return "纯品牌租户，走采购补货";
        return hasBom ? "混合型租户且款式有BOM，走生产" : "混合型租户且款式无BOM，走采购";
    }

    /** 目标补货量 = 安全库存 - 当前库存 + 在途消耗（简化版） */
    private Integer computeTargetQuantity(EcStockAlert alert) {
        if (alert.getSafeStock() == null || alert.getCurrentStock() == null) return 0;
        int gap = alert.getSafeStock() - alert.getCurrentStock();
        return Math.max(gap, 0);
    }

    private Integer queryOnWayProduction(Long styleId) {
        if (styleId == null) return 0;
        try {
            // ProductionOrder.styleId 是 String，需转换
            String styleIdStr = String.valueOf(styleId);
            // status 为字符串：PENDING/IN_PROGRESS/CUTTING/SEWING/QUALITY/WAREHOUSE/COMPLETED/CANCELLED
            long count = productionOrderService.count(new LambdaQueryWrapper<ProductionOrder>()
                    .eq(ProductionOrder::getStyleId, styleIdStr)
                    .in(ProductionOrder::getStatus,
                            "PENDING", "IN_PROGRESS", "CUTTING", "SEWING", "QUALITY"));
            return (int) count;
        } catch (Exception e) {
            log.debug("[SmartReplenishment] 查询在产数量失败 styleId={}: {}", styleId, e.getMessage());
            return 0;
        }
    }

    private StyleInfo resolveStyle(Long styleId) {
        if (styleId == null) return null;
        try { return styleInfoService.getById(styleId); } catch (Exception e) { return null; }
    }

    private ProductSku resolveSku(Long skuId) {
        if (skuId == null) return null;
        try { return productSkuService.getById(skuId); } catch (Exception e) { return null; }
    }

    private boolean hasPendingSuggestion(Long tenantId, Long skuId) {
        if (skuId == null) return false;
        return suggestionService.count(new LambdaQueryWrapper<EcPurchaseSuggestion>()
                .eq(EcPurchaseSuggestion::getTenantId, tenantId)
                .eq(EcPurchaseSuggestion::getSkuId, skuId)
                .eq(EcPurchaseSuggestion::getStatus, 0)) > 0;
    }

    private void persistSuggestion(EcStockAlert alert, ReplenishmentAdvice advice) {
        EcPurchaseSuggestion s = new EcPurchaseSuggestion();
        s.setTenantId(alert.getTenantId());
        s.setStyleId(alert.getStyleId());
        s.setSkuId(alert.getSkuId());
        s.setSkuCode(alert.getSkuCode());
        s.setSuggestQuantity(advice.getSuggestQuantity());
        s.setUrgencyLevel(advice.getUrgencyLevel());
        s.setReason(advice.getAiReason());
        s.setAvailableStock(alert.getCurrentStock());
        s.setTargetDays(7);
        s.setStatus(0);
        s.setSuggestionType(advice.getSuggestionType());
        s.setAiConfidence(advice.getAiConfidence());
        s.setAiReason(advice.getAiReason());
        suggestionService.save(s);
        log.info("[SmartReplenishment] 建议已生成 tenantId={} skuCode={} type={} confidence={} qty={}",
                alert.getTenantId(), alert.getSkuCode(), advice.getSuggestionType(),
                advice.getAiConfidence(), advice.getSuggestQuantity());
    }

    /** AI 决策结果 */
    private static class AiVerdict {
        String type;
        int confidence;
        String reason;
    }

    /** 补货建议（生成后落库为 EcPurchaseSuggestion PENDING） */
    @Data
    public static class ReplenishmentAdvice {
        private String suggestionType;
        private Integer suggestQuantity;
        private Integer aiConfidence;
        private String aiReason;
        private String urgencyLevel;
    }
}
