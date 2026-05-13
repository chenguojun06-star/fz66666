package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.factory.CuttingOrderFactory;
import com.fashion.supplychain.production.helper.OrderRemarkHelper;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.service.OrderRemarkService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
@RequiredArgsConstructor
public class CuttingTaskOrchestrator {

    private static final String FACTORY_TYPE_INTERNAL = "INTERNAL";
    private static final String FACTORY_TYPE_EXTERNAL = "EXTERNAL";

    private final CuttingTaskService cuttingTaskService;
    private final ProductionOrderService productionOrderService;
    private final ProductionOrderScanRecordDomainService scanRecordDomainService;
    private final MaterialPurchaseService materialPurchaseService;
    private final OrderRemarkService orderRemarkService;
    private final CuttingOrderFactory cuttingOrderFactory;

    @Autowired
    private com.fashion.supplychain.production.service.SysNoticeService sysNoticeService;

    @Autowired
    private OrderRemarkHelper orderRemarkHelper;

    private boolean isDirectCuttingOrder(ProductionOrder order, CuttingTask task) {
        String orderNo = order != null && StringUtils.hasText(order.getOrderNo())
                ? order.getOrderNo().trim()
                : (task != null && StringUtils.hasText(task.getProductionOrderNo())
                ? task.getProductionOrderNo().trim()
                : null);
        return StringUtils.hasText(orderNo) && orderNo.toUpperCase().startsWith("CUT");
    }

    private boolean hasCuttingMaterialReady(ProductionOrder order, CuttingTask task) {
        if (isDirectCuttingOrder(order, task)) {
            return true;
        }
        if (order == null || !StringUtils.hasText(order.getId())) {
            return false;
        }
        if (materialPurchaseService.hasConfirmedQuantityByOrderId(order.getId(), true)) {
            return true;
        }
        Integer rate = order.getMaterialArrivalRate();
        if (rate != null && rate >= 100) {
            return true;
        }
        return order.getProcurementManuallyCompleted() != null && order.getProcurementManuallyCompleted() == 1;
    }

    public IPage<CuttingTask> queryPage(Map<String, Object> params) {
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            List<String> factoryOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .and(w -> w.eq(ProductionOrder::getFactoryId, ctxFactoryId).or().isNull(ProductionOrder::getFactoryId))
                            .ne(ProductionOrder::getStatus, "scrapped")
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
            ).stream().map(ProductionOrder::getId).collect(Collectors.toList());
            if (factoryOrderIds.isEmpty()) {
                return new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
            }
            Map<String, Object> mutableParams = new java.util.HashMap<>(params != null ? params : new java.util.HashMap<>());
            mutableParams.put("_factoryOrderIds", factoryOrderIds);
            IPage<CuttingTask> factoryPage = cuttingTaskService.queryPage(mutableParams);
            java.util.Set<String> scannedIds = scanRecordDomainService.batchHasProductionTypeScanRecords(
                    factoryPage.getRecords().stream()
                            .map(CuttingTask::getProductionOrderId)
                            .filter(StringUtils::hasText)
                            .collect(Collectors.toList()));
            factoryPage.getRecords().forEach(t -> t.setHasScanRecords(scannedIds.contains(t.getProductionOrderId())));
            return factoryPage;
        }
        Map<String, Object> pcParams = params != null ? new java.util.HashMap<>(params) : new java.util.HashMap<>();
        IPage<CuttingTask> page = cuttingTaskService.queryPage(pcParams);
        java.util.Set<String> scannedIds = scanRecordDomainService.batchHasProductionTypeScanRecords(
                page.getRecords().stream()
                        .map(CuttingTask::getProductionOrderId)
                        .filter(StringUtils::hasText)
                        .collect(Collectors.toList()));
        page.getRecords().forEach(t -> t.setHasScanRecords(scannedIds.contains(t.getProductionOrderId())));
        return page;
    }

    public Map<String, Object> getStatusStats(Map<String, Object> params) {
        String orderNo = params != null ? getTrimmedText(params, "orderNo") : null;
        String styleNo = params != null ? getTrimmedText(params, "styleNo") : null;
        String factoryType = normalizeFactoryType(params != null ? getTrimmedText(params, "factoryType") : null);

        LambdaQueryWrapper<CuttingTask> baseWrapper = new LambdaQueryWrapper<CuttingTask>()
                .select(CuttingTask::getId, CuttingTask::getStatus, CuttingTask::getOrderQuantity, CuttingTask::getProductionOrderId)
                .like(StringUtils.hasText(orderNo), CuttingTask::getProductionOrderNo, orderNo)
                .like(StringUtils.hasText(styleNo), CuttingTask::getStyleNo, styleNo);

        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            List<String> factoryOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .and(w -> w.eq(ProductionOrder::getFactoryId, ctxFactoryId).or().isNull(ProductionOrder::getFactoryId))
                            .ne(ProductionOrder::getStatus, "scrapped")
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
            ).stream().map(ProductionOrder::getId).collect(Collectors.toList());
            if (factoryOrderIds.isEmpty()) {
                Map<String, Object> emptyStats = new java.util.LinkedHashMap<>();
                emptyStats.put("totalCount", 0L);
                emptyStats.put("totalQuantity", 0L);
                emptyStats.put("pendingCount", 0L);
                emptyStats.put("receivedCount", 0L);
                emptyStats.put("bundledCount", 0L);
                return emptyStats;
            }
            baseWrapper.in(CuttingTask::getProductionOrderId, factoryOrderIds);
        }

        String effectiveFactoryType = StringUtils.hasText(factoryType) ? factoryType :
                (!DataPermissionHelper.isFactoryAccount() ? "INTERNAL" : null);
        if (StringUtils.hasText(effectiveFactoryType)) {
            List<String> matchedOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(ProductionOrder::getFactoryType, effectiveFactoryType)
                            .ne(ProductionOrder::getStatus, "scrapped")
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
            ).stream().map(ProductionOrder::getId).filter(StringUtils::hasText).collect(Collectors.toList());
            if (matchedOrderIds.isEmpty()) {
                Map<String, Object> emptyStats = new java.util.LinkedHashMap<>();
                emptyStats.put("totalCount", 0L);
                emptyStats.put("totalQuantity", 0L);
                emptyStats.put("pendingCount", 0L);
                emptyStats.put("receivedCount", 0L);
                emptyStats.put("bundledCount", 0L);
                return emptyStats;
            }
            baseWrapper.in(CuttingTask::getProductionOrderId, matchedOrderIds);
        }

        List<CuttingTask> allTasks = cuttingTaskService.list(baseWrapper);

        Map<String, Object> stats = new java.util.LinkedHashMap<>();
        stats.put("totalCount", (long) allTasks.size());
        stats.put("totalQuantity", allTasks.stream().mapToLong(t -> t.getOrderQuantity() != null ? t.getOrderQuantity() : 0).sum());
        stats.put("pendingCount", allTasks.stream().filter(t -> "pending".equals(t.getStatus())).count());
        stats.put("receivedCount", allTasks.stream().filter(t -> "received".equals(t.getStatus())).count());
        stats.put("bundledCount", allTasks.stream().filter(t -> "bundled".equals(t.getStatus())).count());
        return stats;
    }

    private String normalizeFactoryType(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        String normalized = raw.trim().toUpperCase();
        if (FACTORY_TYPE_INTERNAL.equals(normalized) || FACTORY_TYPE_EXTERNAL.equals(normalized)) {
            return normalized;
        }
        return null;
    }

    private String getTrimmedText(Map<String, Object> body, String key) {
        if (body == null || key == null) {
            return null;
        }
        Object v = body.get(key);
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return StringUtils.hasText(s) ? s : null;
    }

    @Transactional(rollbackFor = Exception.class)
    public CuttingTask createCustom(Map<String, Object> body) {
        return cuttingOrderFactory.createCustom(body);
    }

    public CuttingTask receive(Map<String, Object> body) {
        String taskId = getTrimmedText(body, "taskId");
        String receiverId = getTrimmedText(body, "receiverId");
        String receiverName = getTrimmedText(body, "receiverName");

        if (!StringUtils.hasText(taskId)) {
            throw new IllegalArgumentException("参数错误");
        }

        CuttingTask task = cuttingTaskService.getById(taskId);
        if (task == null) {
            throw new NoSuchElementException("裁剪任务不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(task.getTenantId(), "裁剪任务");

        assertMaterialReady(task);
        assertNotReceivedByOther(task, receiverId, receiverName);

        boolean ok = cuttingTaskService.receiveTask(taskId, receiverId, receiverName);
        if (!ok) {
            assertNotReceivedByOtherAfterFail(taskId, receiverId, receiverName);
            throw new IllegalStateException("领取失败");
        }

        CuttingTask updated = cuttingTaskService.getById(taskId);
        if (updated == null) {
            throw new IllegalStateException("领取失败");
        }

        writeReceiveRemark(updated);
        sendReceiveNotice(updated);

        return updated;
    }

    private void assertMaterialReady(CuttingTask task) {
        String orderId = task.getProductionOrderId();
        if (StringUtils.hasText(orderId)) {
            ProductionOrder order = productionOrderService.getById(orderId.trim());
            if (order != null) {
                TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "生产订单");
            }
            if (!hasCuttingMaterialReady(order, task)) {
                throw new IllegalStateException("主面料尚未完成可裁确认，无法领取裁剪任务");
            }
        }
    }

    private void assertNotReceivedByOther(CuttingTask task, String receiverId, String receiverName) {
        String status = task.getStatus() == null ? "" : task.getStatus().trim();
        if ("pending".equals(status) || !StringUtils.hasText(status)) {
            return;
        }
        String existingReceiverId = task.getReceiverId() == null ? null : task.getReceiverId().trim();
        String existingReceiverName = task.getReceiverName() == null ? null : task.getReceiverName().trim();
        boolean isSame = isSameOperator(receiverId, receiverName, existingReceiverId, existingReceiverName);
        if (!isSame) {
            String otherName = StringUtils.hasText(existingReceiverName) ? existingReceiverName : "他人";
            throw new IllegalStateException("该任务已被「" + otherName + "」领取，无法重复领取");
        }
    }

    private void assertNotReceivedByOtherAfterFail(String taskId, String receiverId, String receiverName) {
        CuttingTask latest = cuttingTaskService.getById(taskId);
        if (latest != null) {
            String latestReceiverId = latest.getReceiverId() == null ? null : latest.getReceiverId().trim();
            String latestReceiverName = latest.getReceiverName() == null ? null : latest.getReceiverName().trim();
            boolean isSameNow = isSameOperator(receiverId, receiverName, latestReceiverId, latestReceiverName);
            if (!isSameNow && StringUtils.hasText(latestReceiverName)) {
                throw new IllegalStateException("该任务已被「" + latestReceiverName + "」领取，无法重复领取");
            }
        }
    }

    private boolean isSameOperator(String id1, String name1, String id2, String name2) {
        if (StringUtils.hasText(id1) && StringUtils.hasText(id2)) {
            return id1.trim().equals(id2);
        }
        if (StringUtils.hasText(name1) && StringUtils.hasText(name2)) {
            return name1.trim().equals(name2);
        }
        return false;
    }

    private void writeReceiveRemark(CuttingTask updated) {
        try {
            if (updated != null && StringUtils.hasText(updated.getProductionOrderNo())) {
                String updatedReceiverName = updated.getReceiverName();
                OrderRemark sysRemark = new OrderRemark();
                sysRemark.setTargetType("order");
                sysRemark.setTargetNo(updated.getProductionOrderNo());
                sysRemark.setAuthorId("system");
                sysRemark.setAuthorName("系统");
                sysRemark.setAuthorRole("裁剪");
                sysRemark.setContent("裁剪任务已领取"
                        + (StringUtils.hasText(updatedReceiverName) ? "，领取人：" + updatedReceiverName : ""));
                sysRemark.setTenantId(updated.getTenantId());
                sysRemark.setCreateTime(LocalDateTime.now());
                sysRemark.setDeleteFlag(0);
                orderRemarkService.save(sysRemark);

                ProductionOrder order = productionOrderService.getByOrderNo(updated.getProductionOrderNo());
                if (order != null) {
                    orderRemarkHelper.append(order, "裁剪领取",
                            (StringUtils.hasText(updatedReceiverName) ? "领取人:" + updatedReceiverName : ""));
                }
            }
        } catch (Exception e) {
            log.warn("自动写入裁剪领取备注失败，不影响主流程", e);
        }
    }

    private void sendReceiveNotice(CuttingTask updated) {
        try {
            Long tenantId = updated.getTenantId();
            String orderNo = updated.getProductionOrderNo() != null ? updated.getProductionOrderNo() : "";
            String receiver = updated.getReceiverName() != null ? updated.getReceiverName() : "未知";
            com.fashion.supplychain.production.entity.SysNotice notice = new com.fashion.supplychain.production.entity.SysNotice();
            notice.setTenantId(tenantId);
            notice.setFromName(receiver);
            notice.setOrderNo(orderNo);
            notice.setTitle("✂️ 裁剪任务已领取 — " + orderNo);
            notice.setContent(String.format("%s 已领取裁剪任务%s，请安排生产排期。",
                receiver, orderNo.isEmpty() ? "" : "（订单 " + orderNo + "）"));
            notice.setNoticeType("cutting_received");
            notice.setIsRead(0);
            notice.setCreatedAt(LocalDateTime.now());
            sysNoticeService.save(notice);
        } catch (Exception e) {
            log.warn("[裁剪领取] 发送通知失败: {}", e.getMessage());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public CuttingTask rollback(Map<String, Object> body) {
        String taskId = getTrimmedText(body, "taskId");
        String reason = getTrimmedText(body, "reason");

        if (!StringUtils.hasText(taskId)) {
            throw new IllegalArgumentException("参数错误");
        }

        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("退回原因不能为空");
        }

        String currentUserId = UserContext.userId();
        String currentUsername = UserContext.username();
        if (!StringUtils.hasText(currentUserId)) {
            throw new AccessDeniedException("未登录或登录已过期");
        }

        CuttingTask task = cuttingTaskService.getById(taskId);
        if (task == null) {
            throw new NoSuchElementException("裁剪任务不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(task.getTenantId(), "裁剪任务");

        if (scanRecordDomainService.hasProductionTypeScanRecords(task.getProductionOrderId())) {
            throw new IllegalStateException("该裁剪任务已存在生产扫码记录，无法退回");
        }

        boolean ok = cuttingTaskService.rollbackTask(taskId);
        if (!ok) {
            throw new IllegalStateException("退回失败");
        }

        markCustomCutOrderScrapped(task, reason);

        cuttingTaskService.insertRollbackLog(task, currentUserId, currentUsername, reason);

        CuttingTask updated = cuttingTaskService.getById(taskId);
        if (updated == null) {
            throw new IllegalStateException("退回失败");
        }
        TenantAssert.assertBelongsToCurrentTenant(updated.getTenantId(), "裁剪任务");
        return updated;
    }

    private void markCustomCutOrderScrapped(CuttingTask task, String reason) {
        if (task == null || !StringUtils.hasText(task.getProductionOrderId())) {
            return;
        }
        String orderNo = StringUtils.hasText(task.getProductionOrderNo()) ? task.getProductionOrderNo().trim() : "";
        if (!orderNo.startsWith("CUT")) {
            return;
        }

        ProductionOrder order = productionOrderService.getById(task.getProductionOrderId().trim());
        if (order == null || order.getDeleteFlag() != 0) {
            return;
        }
        String currentStatus = order.getStatus() == null ? "" : order.getStatus().trim().toLowerCase();
        if ("scrapped".equals(currentStatus)) {
            return;
        }

        order.setStatus("scrapped");
        order.setUpdateTime(LocalDateTime.now());
        if (StringUtils.hasText(reason)) {
            order.setOperationRemark(reason.trim());
        }
        boolean updated = productionOrderService.updateById(order);
        if (!updated) {
            throw new IllegalStateException("退回成功但更新订单报废状态失败");
        }
    }

    public List<CuttingTask> getMyTasks() {
        UserContext ctx = UserContext.get();
        String userId = ctx == null ? null : ctx.getUserId();
        if (!StringUtils.hasText(userId)) {
            return new ArrayList<>();
        }

        List<CuttingTask> tasks = cuttingTaskService.lambdaQuery()
                .select(
                        CuttingTask::getId,
                        CuttingTask::getProductionOrderId,
                        CuttingTask::getProductionOrderNo,
                        CuttingTask::getStyleNo,
                        CuttingTask::getColor,
                        CuttingTask::getOrderQuantity,
                        CuttingTask::getReceiverName,
                        CuttingTask::getReceivedTime,
                        CuttingTask::getExpectedShipDate
                )
                .eq(CuttingTask::getReceiverId, userId)
                .eq(CuttingTask::getStatus, "received")
                .orderByDesc(CuttingTask::getReceivedTime)
                .list();

        if (tasks.isEmpty()) {
            return tasks;
        }

        Set<String> orderIds = tasks.stream()
                .map(CuttingTask::getProductionOrderId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());

        if (orderIds.isEmpty()) {
            return tasks;
        }

        Set<String> validOrderIds = productionOrderService.lambdaQuery()
            .select(ProductionOrder::getId)
                .in(ProductionOrder::getId, orderIds)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived", "scrapped")
                .list()
                .stream()
                .map(ProductionOrder::getId)
                .collect(Collectors.toSet());

        return tasks.stream()
                .filter(task -> validOrderIds.contains(task.getProductionOrderId()))
                .collect(Collectors.toList());
    }
}
