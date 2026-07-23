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

    // ==================== 智能定价 ====================

    /** 获取调价建议列表 */
    @GetMapping("/price/suggestions")
    public Result<List<Map<String, Object>>> getPriceSuggestions() {
        Long tenantId = UserContext.tenantId();
        List<EcPriceSyncOrchestrator.PriceSuggestion> suggestions =
                priceSyncOrchestrator.getPriceChangeSuggestions(tenantId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (EcPriceSyncOrchestrator.PriceSuggestion s : suggestions) {
            Map<String, Object> map = new HashMap<>();
            map.put("skuId", s.getSkuId());
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
