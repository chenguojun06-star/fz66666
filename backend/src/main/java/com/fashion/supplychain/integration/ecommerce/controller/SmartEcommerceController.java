package com.fashion.supplychain.integration.ecommerce.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcPriceSyncOrchestrator;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcRefundOrchestrator;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcStockDiscrepancyOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 电商智能模块Controller：暴露定价同步、自动退款、库存差异检测的REST API
 */
@Slf4j
@RestController
@RequestMapping("/api/ecommerce")
@PreAuthorize("isAuthenticated()")
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class SmartEcommerceController {

    @Autowired
    private EcPriceSyncOrchestrator priceSyncOrchestrator;

    @Autowired
    private EcRefundOrchestrator refundOrchestrator;

    @Autowired
    private EcStockDiscrepancyOrchestrator stockDiscrepancyOrchestrator;

    /** 用于把 skuId 换出款号/颜色/款式图（定价建议只存了 skuId，列表否则"看不出是什么商品"） */
    @Autowired
    private com.fashion.supplychain.style.orchestration.ProductSkuOrchestrator productSkuOrchestrator;

    /** 订单级列表（物流异常 / 平台账单）本身不含 skuCode，需按订单号回查 */
    @Autowired
    private com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService ecommerceOrderService;

    /** 单次解析上限，防止前端一次传上千个订单号拖垮查询 */
    private static final int BRIEF_MAX_ORDER_NOS = 500;

    /**
     * 按订单号批量解析商品摘要（款号/颜色/尺码/款式图）。
     *
     * <p>物流异常、平台账单这类"订单级"表里只有订单号，没有 {@code skuCode}，
     * 列表因此显示不出是什么商品。这里用订单号回到 {@code t_ecommerce_order}
     * 取 skuCode，再复用 {@code POST /api/style/sku/brief} 的口径解析。
     *
     * <p>请求体支持两种键（都可不传）：
     * <ul>
     *   <li>{@code orderNos} —— 内部订单号（物流异常表里的 {@code orderNo}）</li>
     *   <li>{@code platformOrderNos} —— 平台订单号（账单表里的 {@code platformOrderNo}）</li>
     * </ul>
     * 返回 {@code 订单号 -> brief}：键就是传入的那个订单号（已 trim，与库中一致），
     * 前端按行里的订单号直接取即可。查不到就不返回该键（不编造）。
     */
    @PostMapping("/orders/brief")
    public Result<Map<String, Map<String, Object>>> briefByOrderNos(
            @RequestBody(required = false) Map<String, List<String>> body) {
        Long tenantId = UserContext.tenantId();
        Map<String, Map<String, Object>> empty = new HashMap<>();
        if (body == null) return Result.success(empty);

        List<String> orderNos = normalizeOrderNos(body.get("orderNos"));
        List<String> platformOrderNos = normalizeOrderNos(body.get("platformOrderNos"));
        if (orderNos.isEmpty() && platformOrderNos.isEmpty()) return Result.success(empty);

        // key（原样订单号） -> skuCode
        Map<String, String> skuByKey = new HashMap<>();
        if (!orderNos.isEmpty()) {
            List<EcommerceOrder> orders = ecommerceOrderService.list(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<EcommerceOrder>()
                            .eq(EcommerceOrder::getTenantId, tenantId)
                            .in(EcommerceOrder::getOrderNo, orderNos));
            for (EcommerceOrder o : orders) {
                if (o.getOrderNo() != null && StringUtils.hasText(o.getSkuCode())) {
                    skuByKey.putIfAbsent(o.getOrderNo(), o.getSkuCode());
                }
            }
        }
        if (!platformOrderNos.isEmpty()) {
            List<EcommerceOrder> orders = ecommerceOrderService.list(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<EcommerceOrder>()
                            .eq(EcommerceOrder::getTenantId, tenantId)
                            .in(EcommerceOrder::getPlatformOrderNo, platformOrderNos));
            for (EcommerceOrder o : orders) {
                if (o.getPlatformOrderNo() != null && StringUtils.hasText(o.getSkuCode())) {
                    skuByKey.putIfAbsent(o.getPlatformOrderNo(), o.getSkuCode());
                }
            }
        }
        if (skuByKey.isEmpty()) return Result.success(empty);

        Map<String, Map<String, Object>> briefBySku =
                productSkuOrchestrator.briefBySkuCodes(skuByKey.values());
        Map<String, Map<String, Object>> result = new HashMap<>();
        skuByKey.forEach((key, skuCode) -> {
            Map<String, Object> brief = briefBySku.get(skuCode);
            if (brief != null) result.put(key, brief);
        });
        return Result.success(result);
    }

    /** trim + 去空 + 去重 + 截断到上限 */
    private List<String> normalizeOrderNos(List<String> raw) {
        if (raw == null || raw.isEmpty()) return java.util.Collections.emptyList();
        return raw.stream()
                .filter(java.util.Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .distinct()
                .limit(BRIEF_MAX_ORDER_NOS)
                .collect(java.util.stream.Collectors.toList());
    }

    // ==================== 智能定价 ====================

    /**
     * 获取调价建议列表。
     *
     * <p>建议里原本只有 {@code skuId}（一个数字），前端列表只能显示数字，看不出是什么商品。
     * 这里统一补上 {@code skuCode / styleNo / color / size / imageUrl}，
     * 口径与 {@code POST /api/style/sku/brief} 一致（t_product_sku 权威解析）。
     */
    @GetMapping("/price/suggestions")
    public Result<List<Map<String, Object>>> getPriceSuggestions() {
        Long tenantId = UserContext.tenantId();
        List<EcPriceSyncOrchestrator.PriceSuggestion> suggestions =
                priceSyncOrchestrator.getPriceChangeSuggestions(tenantId);
        Map<Long, Map<String, Object>> briefById = productSkuOrchestrator.briefBySkuIds(
                suggestions.stream()
                        .map(EcPriceSyncOrchestrator.PriceSuggestion::getSkuId)
                        .collect(java.util.stream.Collectors.toList()));
        List<Map<String, Object>> result = new ArrayList<>();
        for (EcPriceSyncOrchestrator.PriceSuggestion s : suggestions) {
            Map<String, Object> map = new HashMap<>();
            map.put("skuId", s.getSkuId());
            // 款号/颜色/尺码/款式图：解析不到就不放，前端据此显示占位（不编造）
            Map<String, Object> brief = briefById.get(s.getSkuId());
            if (brief != null) {
                map.put("skuCode", brief.get("skuCode"));
                map.put("styleNo", brief.get("styleNo"));
                map.put("color", brief.get("color"));
                map.put("size", brief.get("size"));
                map.put("imageUrl", brief.get("imageUrl"));
            }
            map.put("oldPrice", s.getOldPrice());
            map.put("newPrice", s.getNewPrice());
            BigDecimal change = s.getNewPrice().subtract(s.getOldPrice());
            map.put("priceChange", change);
            map.put("priceChangePercent", s.getOldPrice().compareTo(BigDecimal.ZERO) != 0
                    ? change.divide(s.getOldPrice(), 4, RoundingMode.HALF_UP)
                            .multiply(new BigDecimal("100")).doubleValue()
                    : 0.0);
            map.put("reason", s.getReason());
            map.put("synced", s.isSynced());
            map.put("status", s.isSynced() ? "APPLIED" : "PENDING");
            map.put("createTime", s.getCreateTime());
            result.add(map);
        }
        return Result.success(result);
    }

    /** 生成定价建议（触发AI计算） */
    @PostMapping("/price/generate")
    public Result<Map<String, Object>> generatePriceSuggestions() {
        Long tenantId = UserContext.tenantId();
        int synced = priceSyncOrchestrator.batchSyncPrices(tenantId);
        Map<String, Object> data = new HashMap<>();
        data.put("calculatedCount", synced);
        data.put("message", "已为 " + synced + " 个SKU计算定价建议");
        return Result.success("AI定价建议已生成", data);
    }

    /** 同步单个SKU价格到平台 */
    @PostMapping("/price/{skuId}/sync")
    public Result<Map<String, Object>> syncSinglePrice(@PathVariable Long skuId) {
        Long tenantId = UserContext.tenantId();
        List<EcPriceSyncOrchestrator.PriceSuggestion> suggestions =
                priceSyncOrchestrator.getPriceChangeSuggestions(tenantId);
        EcPriceSyncOrchestrator.PriceSuggestion target = suggestions.stream()
                .filter(s -> s.getSkuId().equals(skuId))
                .findFirst()
                .orElse(null);
        if (target == null) {
            return Result.badRequest("未找到该SKU的调价建议");
        }
        boolean ok = priceSyncOrchestrator.syncPriceToPlatform(tenantId, skuId, target.getNewPrice());
        Map<String, Object> data = new HashMap<>();
        data.put("success", ok);
        data.put("skuId", skuId);
        data.put("syncedPrice", target.getNewPrice());
        return Result.success(ok ? "定价已同步到平台" : "同步失败", data);
    }

    /** 批量同步所有待处理定价 */
    @PostMapping("/price/batch-sync")
    public Result<Map<String, Object>> batchSyncPrices() {
        Long tenantId = UserContext.tenantId();
        int synced = priceSyncOrchestrator.batchSyncPrices(tenantId);
        Map<String, Object> data = new HashMap<>();
        data.put("syncedCount", synced);
        return Result.success("批量同步完成，共同步 " + synced + " 个SKU", data);
    }

    /** 定价统计 */
    @GetMapping("/price/stats")
    public Result<Map<String, Object>> getPriceStats() {
        Long tenantId = UserContext.tenantId();
        List<EcPriceSyncOrchestrator.PriceSuggestion> suggestions =
                priceSyncOrchestrator.getPriceChangeSuggestions(tenantId);
        int total = suggestions.size();
        int pending = (int) suggestions.stream().filter(s -> !s.isSynced()).count();
        int applied = (int) suggestions.stream().filter(EcPriceSyncOrchestrator.PriceSuggestion::isSynced).count();
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalSuggestions", total);
        stats.put("pendingCount", pending);
        stats.put("appliedCount", applied);
        stats.put("avgConfidence", 0); // 后端未计算置信度，预留
        return Result.success(stats);
    }

    // ==================== 智能退款 ====================

    /** 待处理退款列表 */
    @GetMapping("/refund/list")
    public Result<List<Map<String, Object>>> getRefundList() {
        Long tenantId = UserContext.tenantId();
        IPage<EcommerceOrder> page = refundOrchestrator.getPendingRefunds(tenantId, 1, 100);
        List<Map<String, Object>> result = new ArrayList<>();
        for (EcommerceOrder order : page.getRecords()) {
            Map<String, Object> map = new HashMap<>();
            map.put("id", order.getId());
            map.put("orderNo", order.getOrderNo());
            map.put("platformOrderNo", order.getPlatformOrderNo());
            map.put("platform", order.getPlatform());
            map.put("skuCode", order.getSkuCode());
            map.put("quantity", order.getQuantity());
            map.put("payAmount", order.getPayAmount());
            map.put("status", order.getStatus());
            map.put("sellerRemark", order.getSellerRemark());
            map.put("createTime", order.getCreateTime());
            boolean shipped = (order.getWarehouseStatus() != null && order.getWarehouseStatus() >= 2)
                    || (order.getTrackingNo() != null && !order.getTrackingNo().isBlank());
            map.put("hasShipped", shipped);
            map.put("aiDecision", shipped ? "REVIEW" : "APPROVE");
            map.put("aiReason", shipped ? "已发货，需人工审核" : "未发货，可自动通过");
            result.add(map);
        }
        return Result.success(result);
    }

    /** 自动处理退款（批量自动审批可自动通过的退款） */
    @PostMapping("/refund/auto-process")
    public Result<Map<String, Object>> autoProcessRefunds() {
        Long tenantId = UserContext.tenantId();
        IPage<EcommerceOrder> page = refundOrchestrator.getPendingRefunds(tenantId, 1, 100);
        int autoApproved = 0;
        int needManual = 0;
        for (EcommerceOrder order : page.getRecords()) {
            try {
                Map<String, Object> result = refundOrchestrator.autoApproveRefund(tenantId, order.getOrderNo());
                if ("退款已执行".equals(result.get("message"))) {
                    autoApproved++;
                } else {
                    needManual++;
                }
            } catch (Exception e) {
                log.warn("[智能退款] 自动处理失败: orderNo={}, {}", order.getOrderNo(), e.getMessage());
                needManual++;
            }
        }
        Map<String, Object> data = new HashMap<>();
        data.put("autoApproved", autoApproved);
        data.put("needManual", needManual);
        return Result.success("自动处理完成：自动通过 " + autoApproved + " 单，待人工审核 " + needManual + " 单", data);
    }

    /** 确认执行退款 */
    @PostMapping("/refund/{orderNo}/approve")
    public Result<Map<String, Object>> approveRefund(@PathVariable String orderNo) {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> data = refundOrchestrator.executeRefund(tenantId, orderNo);
        return Result.success("退款已执行", data);
    }

    /** 拒绝退款 */
    @PostMapping("/refund/{orderNo}/reject")
    public Result<Map<String, Object>> rejectRefund(@PathVariable String orderNo,
                                                     @RequestParam(required = false) String reason) {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> data = refundOrchestrator.rejectRefund(tenantId, orderNo, reason);
        return Result.success("退款已拒绝", data);
    }

    /** 退款统计 */
    @GetMapping("/refund/stats")
    public Result<Map<String, Object>> getRefundStats() {
        Long tenantId = UserContext.tenantId();
        IPage<EcommerceOrder> page = refundOrchestrator.getPendingRefunds(tenantId, 1, 1000);
        List<EcommerceOrder> records = page.getRecords();
        int total = (int) page.getTotal();
        int autoApproved = 0;
        BigDecimal totalAmount = BigDecimal.ZERO;
        for (EcommerceOrder o : records) {
            boolean shipped = (o.getWarehouseStatus() != null && o.getWarehouseStatus() >= 2)
                    || (o.getTrackingNo() != null && !o.getTrackingNo().isBlank());
            if (!shipped && o.getPayAmount() != null
                    && o.getPayAmount().compareTo(new BigDecimal("100")) <= 0) {
                autoApproved++;
            }
            if (o.getPayAmount() != null) totalAmount = totalAmount.add(o.getPayAmount());
        }
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalRequests", total);
        stats.put("pendingCount", total);
        stats.put("autoApprovedCount", autoApproved);
        stats.put("manualReviewCount", total - autoApproved);
        stats.put("totalRefundAmount", totalAmount);
        return Result.success(stats);
    }

    // ==================== 库存差异检测 ====================

    /** 获取库存差异列表 */
    @GetMapping("/stock/discrepancies")
    public Result<List<Map<String, Object>>> getDiscrepancies() {
        Long tenantId = UserContext.tenantId();
        List<Map<String, Object>> data = stockDiscrepancyOrchestrator.getDiscrepancyReport(tenantId);
        return Result.success(data);
    }

    /** 扫描库存差异（触发检测） */
    @PostMapping("/stock/scan")
    public Result<Map<String, Object>> scanDiscrepancies() {
        Long tenantId = UserContext.tenantId();
        List<Map<String, Object>> results = stockDiscrepancyOrchestrator.detectDiscrepancies(tenantId);
        Map<String, Object> data = new HashMap<>();
        data.put("detectedCount", results.size());
        data.put("results", results);
        return Result.success("扫描完成，发现 " + results.size() + " 条差异", data);
    }

    /** 处理库存差异 */
    @PostMapping("/stock/{skuId}/resolve")
    public Result<Map<String, Object>> resolveDiscrepancy(@PathVariable Long skuId,
                                                           @RequestParam String resolution) {
        Long tenantId = UserContext.tenantId();
        stockDiscrepancyOrchestrator.reconcileDiscrepancy(tenantId, skuId, resolution);
        Map<String, Object> data = new HashMap<>();
        data.put("skuId", skuId);
        data.put("resolution", resolution);
        String msg = switch (resolution.toUpperCase()) {
            case "ACCEPT_LOCAL" -> "已以本地库存为准同步到平台";
            case "ACCEPT_PLATFORM" -> "已以平台库存为准更新本地";
            case "MANUAL_CHECK" -> "已标记为人工核对";
            default -> "处理完成";
        };
        return Result.success(msg, data);
    }

    /** 库存差异统计 */
    @GetMapping("/stock/discrepancy-stats")
    public Result<Map<String, Object>> getDiscrepancyStats() {
        Long tenantId = UserContext.tenantId();
        List<Map<String, Object>> report = stockDiscrepancyOrchestrator.getDiscrepancyReport(tenantId);
        int total = report.size();
        int surplus = 0;
        int shortage = 0;
        int unresolved = 0;
        int totalDiff = 0;
        for (Map<String, Object> r : report) {
            String type = (String) r.get("type");
            if ("SURPLUS".equals(type)) surplus++;
            else if ("SHORTAGE".equals(type)) shortage++;
            if (r.get("resolution") == null) unresolved++;
            Integer diff = (Integer) r.get("diffQty");
            if (diff != null) totalDiff += Math.abs(diff);
        }
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalDiscrepancies", total);
        stats.put("unresolvedCount", unresolved);
        stats.put("surplusCount", surplus);
        stats.put("shortageCount", shortage);
        stats.put("totalDiffQty", totalDiff);
        return Result.success(stats);
    }
}
