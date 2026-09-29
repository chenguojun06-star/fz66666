package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.MaterialPickingItemMapper;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class MaterialPickingOrchestrator {

    @Autowired
    private MaterialPickingService materialPickingService;

    @Autowired
    private MaterialPickingItemMapper materialPickingItemMapper;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private com.fashion.supplychain.warehouse.orchestration.MaterialPickupOrchestrator materialPickupOrchestrator;

    @Autowired
    private com.fashion.supplychain.warehouse.mapper.MaterialPickupRecordMapper materialPickupRecordMapper;

    @Autowired
    private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;

    @Autowired
    private SysNoticeOrchestrator sysNoticeOrchestrator;

    /** 直接创建领料单（不走归属校验，供内部调用）。 */
    public String createPicking(MaterialPicking picking, List<MaterialPickingItem> items) {
        return materialPickingService.createPicking(picking, items);
    }

    /**
     * BOM 申请领取（D-099 重构）：
     * <ul>
     *   <li>INTERNAL 内部领料：领取即出库 —— 同事务创建+确认出库（扣库存+写出库日志+记录操作人），
     *       不再产生待出库单和仓库通知（修复：无限领取/库存不扣减/通知挂着不消失）</li>
     *   <li>EXTERNAL 外发厂领用：保持两步流（pending + 通知 + 仓库确认），audit 含外发厂账单/应收联动</li>
     * </ul>
     *
     * <p>P0 修复（数据完整性）：禁止将空字符串作为 orderId/orderNo/styleNo 保存，否则领料单
     * 无归属失联，仓库端无法定位归属订单/样衣任务。统一把空字符串标准化为 null。
     * 并强制要求至少一个归属锚点（orderId / patternProductionId / styleNo），
     * 防止完全无归属的"幽灵领料单"。
     *
     * @return 领料单 id
     * @throws IllegalArgumentException 缺少归属关联
     */
    public Result<String> createPending(MaterialPicking picking, List<MaterialPickingItem> items) {
        if (!StringUtils.hasText(picking.getOrderId())) {
            picking.setOrderId(null);
        }
        if (!StringUtils.hasText(picking.getOrderNo())) {
            picking.setOrderNo(null);
        }
        if (!StringUtils.hasText(picking.getStyleNo())) {
            picking.setStyleNo(null);
        }
        if (!StringUtils.hasText(picking.getPatternProductionId())) {
            picking.setPatternProductionId(null);
        }
        boolean hasAnchor = StringUtils.hasText(picking.getOrderId())
                || StringUtils.hasText(picking.getPatternProductionId())
                || StringUtils.hasText(picking.getStyleNo());
        if (!hasAnchor) {
            throw new IllegalArgumentException("领料单缺少归属关联（订单号/样衣任务ID/款号），请返回重试");
        }
        // 强制设置 status=pending，前端可能未传此字段（INTERNAL 由 createPickingAndOutbound 同事务转 completed）
        picking.setStatus(com.fashion.supplychain.common.constant.MaterialConstants.STATUS_PENDING);
        // BOM领取默认为样衣用料（开发场景），前端未传时兜底
        if (picking.getUsageType() == null || picking.getUsageType().isEmpty()) {
            picking.setUsageType("SAMPLE");
        }
        if (picking.getPickupType() == null || picking.getPickupType().isEmpty()) {
            picking.setPickupType("INTERNAL");
        }
        boolean external = "EXTERNAL".equalsIgnoreCase(picking.getPickupType());
        if (!external) {
            // D-099：内部领料领取即出库（同事务：建单+扣库存+出库日志+采购单联动），
            // 库存不足会整体回滚并报错，杜绝"只建单不扣库存"
            return Result.success(materialPurchaseOrchestrator.createPickingAndOutbound(picking, items));
        }
        String pickingId = materialPickingService.savePendingPicking(picking, items);
        // 通知仓库人员（失败不影响领料单创建）——仅 EXTERNAL 外发领用需要仓库确认
        try {
            Long tenantId = UserContext.tenantId();
            sysNoticeOrchestrator.sendPickupNotification(tenantId, picking, items);
        } catch (Exception e) {
            log.warn("[Picking] 发送仓库领取通知失败 pickingNo={}: {}", picking.getPickingNo(), e.getMessage());
        }
        return Result.success(pickingId);
    }

    /** 领料单明细。 */
    public List<MaterialPickingItem> getItems(String pickingId) {
        return materialPickingService.getItemsByPickingId(pickingId);
    }

    /**
     * 领料单分页查询（带数据权限、订单归属富化、明细批量回填）。
     *
     * <p>工厂账号只看自己订单的领料单（{@code DataPermissionHelper.getFactoryOrderIds}）。
     */
    public Result<com.baomidou.mybatisplus.core.metadata.IPage<MaterialPicking>> pagePicking(
            int page, int pageSize, String orderNo, String styleNo, String status,
            String keyword, String pickupType, String usageType, String startDate, String endDate) {

        List<String> factoryOrderIds = com.fashion.supplychain.common.DataPermissionHelper
                .getFactoryOrderIds(productionOrderService);
        if (factoryOrderIds != null && factoryOrderIds.isEmpty()) {
            return Result.success(new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>());
        }

        LambdaQueryWrapper<MaterialPicking> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialPicking::getDeleteFlag, 0);
        com.fashion.supplychain.common.tenant.TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
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

        com.baomidou.mybatisplus.core.metadata.IPage<MaterialPicking> result = materialPickingService.page(
                new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(page, pageSize), wrapper);
        List<MaterialPicking> records = result.getRecords();

        // 富化订单归属（工厂/工厂类型），供列表展示与权限判断
        java.util.Set<String> orderIds = records.stream()
                .map(MaterialPicking::getOrderId)
                .filter(StringUtils::hasText)
                .collect(java.util.stream.Collectors.toSet());
        if (!orderIds.isEmpty()) {
            Map<String, ProductionOrder> orderMap = productionOrderService.listByIds(orderIds).stream()
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

        // 批量回填明细，避免前端逐条请求
        java.util.Set<String> pickingIds = records.stream()
                .map(MaterialPicking::getId)
                .filter(StringUtils::hasText)
                .collect(java.util.stream.Collectors.toSet());
        if (!pickingIds.isEmpty()) {
            List<MaterialPickingItem> allItems = materialPickingItemMapper.selectList(
                    new LambdaQueryWrapper<MaterialPickingItem>()
                            .in(MaterialPickingItem::getPickingId, pickingIds));
            Map<String, List<MaterialPickingItem>> itemsByPickingId = allItems.stream()
                    .collect(java.util.stream.Collectors.groupingBy(MaterialPickingItem::getPickingId));
            for (MaterialPicking record : records) {
                record.setItems(itemsByPickingId.getOrDefault(record.getId(), java.util.Collections.emptyList()));
            }
        }

        return Result.success(result);
    }

    /**
     * 取消待出库领料单（仅 pending 状态可操作）。
     * 回退已锁定的库存 + 恢复关联采购单状态 + 删除领料明细与领料单。
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancelPending(String id) {
        Long tenantId = UserContext.tenantId();
        MaterialPicking picking = materialPickingService.lambdaQuery()
                .eq(MaterialPicking::getId, id)
                .eq(MaterialPicking::getTenantId, tenantId)
                .eq(MaterialPicking::getDeleteFlag, 0)
                .one();
        if (picking == null) {
            throw new java.util.NoSuchElementException("领料单不存在");
        }
        if (!UserContext.isSuperAdmin()) {
            if (tenantId == null || !tenantId.equals(picking.getTenantId())) {
                throw new IllegalStateException("无权操作此领料单");
            }
        }
        if (!"pending".equals(picking.getStatus())) {
            throw new IllegalStateException("仅待出库状态的领料单可取消");
        }

        List<MaterialPickingItem> items = materialPickingItemMapper.selectList(
                new LambdaQueryWrapper<MaterialPickingItem>()
                        .eq(MaterialPickingItem::getPickingId, id));

        for (MaterialPickingItem item : items) {
            // D-414：领料数量已是 BigDecimal，解锁量同步支持小数（此前 1.32 米只解锁 1）
            if (item.getMaterialStockId() != null && item.getQuantity() != null
                    && item.getQuantity().compareTo(java.math.BigDecimal.ZERO) > 0) {
                materialStockService.unlockStock(item.getMaterialStockId(), item.getQuantity());
                log.info("[Picking] 取消待出库: 解锁库存 stockId={}, qty={}", item.getMaterialStockId(), item.getQuantity());
            }
        }

        String cancelPurchaseId = picking.getPurchaseId();
        if (cancelPurchaseId == null || cancelPurchaseId.isEmpty()) {
            String remark = picking.getRemark();
            if (remark != null && remark.contains("purchaseId=")) {
                cancelPurchaseId = remark.substring(remark.indexOf("purchaseId=") + "purchaseId=".length()).trim();
            }
        }
        if (cancelPurchaseId != null && !cancelPurchaseId.isEmpty()) {
            // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById
            MaterialPurchase purchase = materialPurchaseService.lambdaQuery()
                    .eq(MaterialPurchase::getId, cancelPurchaseId)
                    .eq(MaterialPurchase::getTenantId, tenantId)
                    .one();
            if (purchase != null && "WAREHOUSE_PENDING".equals(purchase.getStatus())) {
                purchase.setStatus("pending");
                purchase.setReceiverId(null);
                purchase.setReceiverName(null);
                purchase.setUpdateTime(java.time.LocalDateTime.now());
                materialPurchaseService.updateById(purchase);
                log.info("[Picking] 取消待出库: 恢复采购单状态 purchaseId={}", cancelPurchaseId);
            }
        }

        // MaterialPickingItem 表无 deleteFlag 字段，items 仍需物理删除
        materialPickingItemMapper.delete(
                new LambdaQueryWrapper<MaterialPickingItem>()
                        .eq(MaterialPickingItem::getPickingId, id));
        // P0-2 修复：picking 改为逻辑删除（status=cancelled），与 cancelPicking 保持一致，
        // 保留审计痕迹，避免统计/历史查询丢失记录
        picking.setStatus("cancelled");
        // 操作日志统一写入 t_operation_log，备注保持人工备注不变（P0：备注与操作日志分离）
        com.fashion.supplychain.common.OperationLogAppendUtil.writeLog(
                "领料出库", "取消待出库", "取消待出库领料单", picking.getId(), picking.getPickingNo());
        picking.setUpdateTime(java.time.LocalDateTime.now());
        materialPickingService.updateById(picking);
        log.info("[Picking] 取消待出库领料单（逻辑删除）: pickingNo={}", picking.getPickingNo());
    }

    /**
     * 删除指定 pickingId 下所有的领料明细。
     */
    @Transactional(rollbackFor = Exception.class)
    public void deleteItemsByPickingId(String pickingId) {
        materialPickingItemMapper.delete(
                new LambdaQueryWrapper<MaterialPickingItem>()
                        .eq(MaterialPickingItem::getPickingId, pickingId));
    }

    @Transactional(rollbackFor = Exception.class)
    public void audit(String id, Map<String, Object> body) {
        // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById（前置校验）
        Long tenantId = UserContext.tenantId();
        MaterialPicking picking = materialPickingService.lambdaQuery()
                .eq(MaterialPicking::getId, id)
                .eq(MaterialPicking::getTenantId, tenantId)
                .one();
        if (picking == null) throw new java.util.NoSuchElementException("领料单不存在");
        if (!UserContext.isSuperAdmin()) {
            if (tenantId == null || !tenantId.equals(picking.getTenantId())) {
                throw new IllegalStateException("无权操作此领料单");
            }
        }
        if (!"completed".equals(picking.getStatus())) {
            throw new IllegalStateException("仅已出库的领料单可审核");
        }

        String action = body.get("action") == null ? "approve" : String.valueOf(body.get("action")).trim();
        String remark = body.get("remark") == null ? null : String.valueOf(body.get("remark")).trim();
        String userId = UserContext.userId();
        String userName = UserContext.username();

        if ("approve".equalsIgnoreCase(action)) {
            picking.setAuditStatus("APPROVED");
            picking.setAuditorId(userId);
            picking.setAuditorName(userName);
            picking.setAuditTime(java.time.LocalDateTime.now());
            picking.setAuditRemark(remark);
            String factoryType = resolveFactoryType(picking);
            if ("EXTERNAL".equalsIgnoreCase(factoryType)) {
                syncAuditToPickupRecords(id, remark);
                picking.setFinanceStatus("SETTLED");
                picking.setFinanceRemark(remark != null
                        ? "外发领料审核通过，已生成应收账单：" + remark.trim()
                        : "外发领料审核通过，已自动生成应收账单");
            } else {
                picking.setFinanceStatus("SETTLED");
                picking.setFinanceRemark(remark != null
                        ? "内部领料审核通过（内部平账）：" + remark
                        : "内部领料审核通过，已做内部平账处理");
                syncAuditToPickupRecords(id, remark);
            }
        } else {
            picking.setAuditStatus("REJECTED");
            picking.setAuditorId(userId);
            picking.setAuditorName(userName);
            picking.setAuditTime(java.time.LocalDateTime.now());
            picking.setAuditRemark(remark);
        }
        picking.setUpdateTime(java.time.LocalDateTime.now());
        materialPickingService.updateById(picking);
        log.info("[Picking] 审核领料单: pickingNo={}, action={}", picking.getPickingNo(), action);
    }

    private void syncAuditToPickupRecords(String pickingId, String remark) {
        try {
            List<com.fashion.supplychain.warehouse.entity.MaterialPickupRecord> pickupRecords =
                    materialPickupRecordMapper.selectList(
                            new LambdaQueryWrapper<com.fashion.supplychain.warehouse.entity.MaterialPickupRecord>()
                                    .eq(com.fashion.supplychain.warehouse.entity.MaterialPickupRecord::getSourceRecordId, pickingId)
                                    .eq(com.fashion.supplychain.warehouse.entity.MaterialPickupRecord::getDeleteFlag, 0));
            for (com.fashion.supplychain.warehouse.entity.MaterialPickupRecord pr : pickupRecords) {
                if ("PENDING".equals(pr.getAuditStatus())) {
                    try {
                        Map<String, Object> auditBody = new java.util.LinkedHashMap<>();
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
                // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById
                Long tenantId = UserContext.tenantId();
                ProductionOrder order = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getId, picking.getOrderId().trim())
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .one();
                if (order != null && StringUtils.hasText(order.getFactoryType())) return order.getFactoryType();
            } catch (Exception e) {
                log.warn("[Picking] 解析工厂类型失败: orderId={}", picking.getOrderId(), e);
            }
        }
        return "INTERNAL";
    }
}
