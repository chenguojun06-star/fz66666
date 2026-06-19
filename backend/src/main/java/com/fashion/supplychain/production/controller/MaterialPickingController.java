package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestrator;
import com.fashion.supplychain.production.service.MaterialPickingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import lombok.extern.slf4j.Slf4j;
import java.util.List;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.util.StringUtils;
import lombok.Data;

@Slf4j
@RestController
@RequestMapping("/api/production/picking")
@PreAuthorize("isAuthenticated()")
public class MaterialPickingController {

    @Autowired
    private MaterialPickingService materialPickingService;

    @Autowired
    private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;

    @Autowired
    private com.fashion.supplychain.production.orchestration.SysNoticeOrchestrator sysNoticeOrchestrator;

    @Autowired
    private com.fashion.supplychain.production.service.MaterialStockService materialStockService;

    @Autowired
    private com.fashion.supplychain.production.service.MaterialPurchaseService materialPurchaseService;

    @Autowired
    private com.fashion.supplychain.production.orchestration.MaterialPickingOrchestrator materialPickingOrchestrator;

    @PostMapping
    public Result<String> create(@RequestBody PickingRequest request) {
        return Result.success(materialPickingService.createPicking(request.getPicking(), request.getItems()));
    }

    /**
     * BOM 申请领取：创建待出库领料单（两步流第一步）
     * status=pending，不立即扣减库存，等待仓库在「面辅料出入库」页确认出库
     */
    @PostMapping("/pending")
    public Result<String> createPending(@RequestBody PickingRequest request) {
        // 强制设置 status=pending，前端可能未传此字段
        request.getPicking().setStatus("pending");
        // BOM领取默认为样衣用料（开发场景），前端未传时兜底
        if (request.getPicking().getUsageType() == null || request.getPicking().getUsageType().isEmpty()) {
            request.getPicking().setUsageType("SAMPLE");
        }
        if (request.getPicking().getPickupType() == null || request.getPicking().getPickupType().isEmpty()) {
            request.getPicking().setPickupType("INTERNAL");
        }
        String pickingId = materialPickingService.savePendingPicking(
                request.getPicking(), request.getItems());
        // 通知仓库人员（失败不影响领料单创建）
        try {
            Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
            sysNoticeOrchestrator.sendPickupNotification(tenantId, request.getPicking(), request.getItems());
        } catch (Exception e) {
            log.warn("[Picking] 发送仓库领取通知失败 pickingNo={}: {}", request.getPicking().getPickingNo(), e.getMessage());
        }
        return Result.success(pickingId);
    }

    @Autowired
    private com.fashion.supplychain.production.service.ProductionOrderService productionOrderService;

    @Autowired
    private com.fashion.supplychain.production.mapper.MaterialPickingItemMapper materialPickingItemMapper;

    @GetMapping("/list")
    public Result<IPage<MaterialPicking>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize,
            @RequestParam(required = false) String orderNo,
            @RequestParam(required = false) String styleNo,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String pickupType,
            @RequestParam(required = false) String usageType,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {

        java.util.List<String> factoryOrderIds = com.fashion.supplychain.common.DataPermissionHelper
                .getFactoryOrderIds(productionOrderService);
        if (factoryOrderIds != null && factoryOrderIds.isEmpty()) {
            return Result.success(new Page<>());
        }

        LambdaQueryWrapper<MaterialPicking> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialPicking::getDeleteFlag, 0);
        com.fashion.supplychain.common.tenant.TenantAssert.assertTenantContext();
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        wrapper.eq(MaterialPicking::getTenantId, tenantId);
        if (factoryOrderIds != null) {
            wrapper.in(MaterialPicking::getOrderId, factoryOrderIds);
        }
        if (StringUtils.hasText(orderNo)) {
            wrapper.like(MaterialPicking::getOrderNo, orderNo);
        }
        if (StringUtils.hasText(styleNo)) {
            wrapper.like(MaterialPicking::getStyleNo, styleNo);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(MaterialPicking::getStatus, status);
        }
        if (StringUtils.hasText(pickupType)) {
            wrapper.eq(MaterialPicking::getPickupType, pickupType);
        }
        if (StringUtils.hasText(usageType)) {
            wrapper.eq(MaterialPicking::getUsageType, usageType);
        }
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(MaterialPicking::getPickingNo, keyword)
                    .or().like(MaterialPicking::getOrderNo, keyword)
                    .or().like(MaterialPicking::getStyleNo, keyword)
                    .or().like(MaterialPicking::getPickerName, keyword));
        }
        if (StringUtils.hasText(startDate)) {
            wrapper.ge(MaterialPicking::getCreateTime, java.time.LocalDate.parse(startDate).atStartOfDay());
        }
        if (StringUtils.hasText(endDate)) {
            wrapper.le(MaterialPicking::getCreateTime, java.time.LocalDate.parse(endDate).atTime(23, 59, 59));
        }
        wrapper.orderByDesc(MaterialPicking::getCreateTime);

        IPage<MaterialPicking> result = materialPickingService.page(new Page<>(page, pageSize), wrapper);
        java.util.List<MaterialPicking> records = result.getRecords();
        java.util.Set<String> orderIds = records.stream()
                .map(MaterialPicking::getOrderId)
                .filter(StringUtils::hasText)
                .collect(java.util.stream.Collectors.toSet());
        if (!orderIds.isEmpty()) {
            java.util.Map<String, ProductionOrder> orderMap = productionOrderService.listByIds(orderIds).stream()
                    .filter(java.util.Objects::nonNull)
                    .collect(java.util.stream.Collectors.toMap(ProductionOrder::getId, o -> o, (a, b) -> a));
            for (MaterialPicking record : records) {
                ProductionOrder order = orderMap.get(record.getOrderId());
                if (order == null) {
                    continue;
                }
                record.setFactoryId(order.getFactoryId());
                record.setFactoryName(order.getFactoryName());
                record.setFactoryType(order.getFactoryType());
            }
        }

        java.util.Set<String> pickingIds = records.stream()
                .map(MaterialPicking::getId)
                .filter(StringUtils::hasText)
                .collect(java.util.stream.Collectors.toSet());
        if (!pickingIds.isEmpty()) {
            List<MaterialPickingItem> allItems = materialPickingItemMapper.selectList(
                    new LambdaQueryWrapper<MaterialPickingItem>()
                            .in(MaterialPickingItem::getPickingId, pickingIds));
            java.util.Map<String, List<MaterialPickingItem>> itemsByPickingId = allItems.stream()
                    .collect(java.util.stream.Collectors.groupingBy(MaterialPickingItem::getPickingId));
            for (MaterialPicking record : records) {
                record.setItems(itemsByPickingId.getOrDefault(record.getId(), java.util.Collections.emptyList()));
            }
        }

        return Result.success(result);
    }

    @GetMapping("/{id}/items")
    public Result<List<MaterialPickingItem>> getItems(@PathVariable String id) {
        return Result.success(materialPickingService.getItemsByPickingId(id));
    }

    /**
     * 仓库确认出库（两步流第二步）
     * 实际扣减库存 + 状态改为 completed
     */
    @PostMapping("/{id}/confirm-outbound")
    public Result<Void> confirmOutbound(@PathVariable String id) {
        materialPurchaseOrchestrator.confirmPickingOutbound(id);
        return Result.success(null);
    }

    /**
     * 取消待出库领料单（仅 pending 状态可操作）
     * 回退已锁定的库存 + 恢复关联采购单状态
     */
    @PostMapping("/{id}/cancel-pending")
    public Result<Void> cancelPending(@PathVariable String id) {
        materialPickingOrchestrator.cancelPending(id);
        return Result.success(null);
    }

    @Autowired
    private com.fashion.supplychain.warehouse.orchestration.MaterialPickupOrchestrator materialPickupOrchestrator;

    @Autowired
    private com.fashion.supplychain.warehouse.mapper.MaterialPickupRecordMapper materialPickupRecordMapper;

    @PostMapping("/{id}/audit")
    public Result<Void> audit(@PathVariable String id, @RequestBody java.util.Map<String, Object> body) {
        try {
            materialPickingOrchestrator.audit(id, body);
        } catch (Exception e) {
            return Result.fail(e.getMessage());
        }
        return Result.success(null);
    }

    @PostMapping("/batch-audit")
    public Result<java.util.Map<String, Object>> batchAudit(@RequestBody java.util.Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        java.util.List<String> ids = (java.util.List<String>) body.get("ids");
        String action = body.get("action") == null ? "approve" : String.valueOf(body.get("action")).trim();
        String remark = body.get("remark") == null ? null : String.valueOf(body.get("remark")).trim();
        if (ids == null || ids.isEmpty()) throw new IllegalArgumentException("请选择要审核的领料单");
        int successCount = 0, failCount = 0;
        java.util.List<String> errors = new java.util.ArrayList<>();
        for (String id : ids) {
            try {
                java.util.Map<String, Object> singleBody = new java.util.LinkedHashMap<>();
                singleBody.put("action", action);
                singleBody.put("remark", remark);
                audit(id, singleBody);
                successCount++;
            } catch (Exception e) { failCount++; errors.add(id + ": " + e.getMessage()); }
        }
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("successCount", successCount);
        result.put("failCount", failCount);
        result.put("errors", errors);
        return Result.success(result);
    }

    private void syncAuditToPickupRecords(String pickingId, String remark) {
        try {
            java.util.List<com.fashion.supplychain.warehouse.entity.MaterialPickupRecord> pickupRecords =
                    materialPickupRecordMapper.selectList(
                            new LambdaQueryWrapper<com.fashion.supplychain.warehouse.entity.MaterialPickupRecord>()
                                    .eq(com.fashion.supplychain.warehouse.entity.MaterialPickupRecord::getSourceRecordId, pickingId)
                                    .eq(com.fashion.supplychain.warehouse.entity.MaterialPickupRecord::getDeleteFlag, 0));
            for (com.fashion.supplychain.warehouse.entity.MaterialPickupRecord pr : pickupRecords) {
                if ("PENDING".equals(pr.getAuditStatus())) {
                    try {
                        java.util.Map<String, Object> auditBody = new java.util.LinkedHashMap<>();
                        auditBody.put("action", "approve");
                        auditBody.put("remark", remark);
                        materialPickupOrchestrator.audit(pr.getId(), auditBody);
                    } catch (Exception e) {
                        log.warn("[Picking] 审核关联领取记录失败: prId={}, error={}", pr.getId(), e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[Picking] 审核时同步领取记录失败: pickingId={}, error={}", pickingId, e.getMessage());
        }
    }

    private String resolveFactoryType(MaterialPicking picking) {
        if (StringUtils.hasText(picking.getFactoryType())) return picking.getFactoryType();
        if (StringUtils.hasText(picking.getOrderId())) {
            try {
                ProductionOrder order = productionOrderService.getById(picking.getOrderId().trim());
                if (order != null && StringUtils.hasText(order.getFactoryType())) return order.getFactoryType();
            } catch (Exception e) {
                log.warn("[Picking] 解析工厂类型失败: orderId={}", picking.getOrderId(), e);
            }
        }
        return "INTERNAL";
    }

    @Data
    public static class PickingRequest {
        private MaterialPicking picking;
        private List<MaterialPickingItem> items;
    }
}
