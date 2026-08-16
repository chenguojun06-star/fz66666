package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.factory.CuttingOrderFactory;
import com.fashion.supplychain.production.helper.CuttingTaskLogAppendHelper;
import com.fashion.supplychain.production.helper.OrderRemarkHelper;
import com.fashion.supplychain.production.helper.OrderStatusGuardHelper;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
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
    private final com.fashion.supplychain.style.service.StyleInfoService styleInfoService;

    @Autowired
    private com.fashion.supplychain.production.service.SysNoticeService sysNoticeService;

    @Autowired
    private OrderRemarkHelper orderRemarkHelper;

    @Autowired
    private CuttingTaskLogAppendHelper logAppendHelper;

    @Autowired
    private OrderStatusGuardHelper orderStatusGuardHelper;

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
        // P0 修复（铁律4 多租户隔离）：强制租户上下文校验
        Long tenantId = TenantAssert.requireTenantId();
        Map<String, Object> pcParams = params != null ? new java.util.HashMap<>(params) : new java.util.HashMap<>();
        pcParams.put("_tenantId", tenantId);

        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            // P0 修复：工厂账号严格匹配 factoryId，移除 .or().isNull(factoryId) 防止跨工厂数据泄露
            List<String> factoryOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(ProductionOrder::getTenantId, tenantId)
                            .eq(ProductionOrder::getFactoryId, ctxFactoryId)
                            .ne(ProductionOrder::getStatus, "scrapped")
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
            ).stream().map(ProductionOrder::getId).collect(Collectors.toList());
            if (factoryOrderIds.isEmpty()) {
                return new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
            }
            pcParams.put("_factoryOrderIds", factoryOrderIds);
            IPage<CuttingTask> factoryPage = cuttingTaskService.queryPage(pcParams);
            java.util.Set<String> scannedIds = scanRecordDomainService.batchHasProductionTypeScanRecords(
                    factoryPage.getRecords().stream()
                            .map(CuttingTask::getProductionOrderId)
                            .filter(StringUtils::hasText)
                            .collect(Collectors.toList()));
            factoryPage.getRecords().forEach(t -> t.setHasScanRecords(scannedIds.contains(t.getProductionOrderId())));
            return factoryPage;
        }

        // P1 修复：与 getStatusStats 对齐，PC端默认仅查 INTERNAL 工厂裁剪任务（除非显式指定 factoryType）
        String factoryType = normalizeFactoryType(getTrimmedText(params, "factoryType"));
        if (factoryType == null) {
            factoryType = FACTORY_TYPE_INTERNAL;
        }
        List<String> matchedOrderIds = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId)
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getFactoryType, factoryType)
                        .ne(ProductionOrder::getStatus, "scrapped")
                        .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
        ).stream().map(ProductionOrder::getId).filter(StringUtils::hasText).collect(Collectors.toList());
        if (matchedOrderIds.isEmpty()) {
            return new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
        }
        pcParams.put("_factoryOrderIds", matchedOrderIds);

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
        // P0 修复（铁律4 多租户隔离）：强制租户上下文校验 + 显式 tenantId 过滤
        Long tenantId = TenantAssert.requireTenantId();
        String orderNo = params != null ? getTrimmedText(params, "orderNo") : null;
        String styleNo = params != null ? getTrimmedText(params, "styleNo") : null;
        String factoryType = normalizeFactoryType(params != null ? getTrimmedText(params, "factoryType") : null);

        LambdaQueryWrapper<CuttingTask> baseWrapper = new LambdaQueryWrapper<CuttingTask>()
                .select(CuttingTask::getId, CuttingTask::getStatus, CuttingTask::getOrderQuantity, CuttingTask::getProductionOrderId)
                // P0 修复：显式 tenantId 过滤，避免依赖全局拦截器（CuttingTask 无 deleteFlag 字段）
                .eq(CuttingTask::getTenantId, tenantId)
                .like(StringUtils.hasText(orderNo), CuttingTask::getProductionOrderNo, orderNo)
                .like(StringUtils.hasText(styleNo), CuttingTask::getStyleNo, styleNo);

        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            // P0 修复：工厂账号严格匹配 factoryId，移除 .or().isNull(factoryId)
            List<String> factoryOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(ProductionOrder::getTenantId, tenantId)
                            .eq(ProductionOrder::getFactoryId, ctxFactoryId)
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
                emptyStats.put("pendingQuantity", 0L);
                emptyStats.put("receivedQuantity", 0L);
                emptyStats.put("bundledQuantity", 0L);
                return emptyStats;
            }
            baseWrapper.in(CuttingTask::getProductionOrderId, factoryOrderIds);
        } else {
            // P1 修复：与 queryPage 默认 factoryType 对齐（PC端默认 INTERNAL）
            String effectiveFactoryType = StringUtils.hasText(factoryType) ? factoryType : FACTORY_TYPE_INTERNAL;
            List<String> matchedOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(ProductionOrder::getTenantId, tenantId)
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
                emptyStats.put("pendingQuantity", 0L);
                emptyStats.put("receivedQuantity", 0L);
                emptyStats.put("bundledQuantity", 0L);
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
        stats.put("pendingQuantity", allTasks.stream().filter(t -> "pending".equals(t.getStatus())).mapToLong(t -> t.getOrderQuantity() != null ? t.getOrderQuantity() : 0).sum());
        stats.put("receivedQuantity", allTasks.stream().filter(t -> "received".equals(t.getStatus())).mapToLong(t -> t.getOrderQuantity() != null ? t.getOrderQuantity() : 0).sum());
        stats.put("bundledQuantity", allTasks.stream().filter(t -> "bundled".equals(t.getStatus())).mapToLong(t -> t.getOrderQuantity() != null ? t.getOrderQuantity() : 0).sum());
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

        // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById（前置校验）
        Long tenantId = UserContext.tenantId();
        CuttingTask task = cuttingTaskService.lambdaQuery()
                .eq(CuttingTask::getId, taskId)
                .eq(CuttingTask::getTenantId, tenantId)
                .one();
        if (task == null) {
            throw new NoSuchElementException("裁剪任务不存在");
        }

        assertMaterialReady(task);
        assertNotReceivedByOther(task, receiverId, receiverName);

        boolean ok = cuttingTaskService.receiveTask(taskId, receiverId, receiverName);
        if (!ok) {
            assertNotReceivedByOtherAfterFail(taskId, receiverId, receiverName);
            throw new IllegalStateException("领取失败");
        }

        // P1 多租户隔离：领取后重新查询也带 tenantId
        CuttingTask updated = cuttingTaskService.lambdaQuery()
                .eq(CuttingTask::getId, taskId)
                .eq(CuttingTask::getTenantId, tenantId)
                .one();
        if (updated == null) {
            throw new IllegalStateException("领取失败");
        }

        sendReceiveNotice(updated);

        // 操作记录由 logAppendHelper.appendAssign 统一写入（操作人=实际领取人）
        // 不再调用 writeReceiveRemark，避免重复写入 author="系统" 的冗余备注
        logAppendHelper.appendAssign(taskId, receiverName);
        return updated;
    }

    private void assertMaterialReady(CuttingTask task) {
        String orderId = task.getProductionOrderId();
        if (StringUtils.hasText(orderId)) {
            // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById
            Long tenantId = UserContext.tenantId();
            ProductionOrder order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getId, orderId.trim())
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .one();
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
        // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById
        Long tenantId = UserContext.tenantId();
        CuttingTask latest = cuttingTaskService.lambdaQuery()
                .eq(CuttingTask::getId, taskId)
                .eq(CuttingTask::getTenantId, tenantId)
                .one();
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

    private void sendReceiveNotice(CuttingTask updated) {
        try {
            Long tenantId = updated.getTenantId();
            String orderNo = updated.getProductionOrderNo() != null ? updated.getProductionOrderNo() : "";
            String receiver = updated.getReceiverName() != null ? updated.getReceiverName() : "未知";
            String toName = receiver;
            if (StringUtils.hasText(updated.getProductionOrderId())) {
                // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById
                ProductionOrder order = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getId, updated.getProductionOrderId().trim())
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .one();
                if (order != null && StringUtils.hasText(order.getMerchandiser())) {
                    toName = order.getMerchandiser();
                }
            }
            com.fashion.supplychain.production.entity.SysNotice notice = new com.fashion.supplychain.production.entity.SysNotice();
            notice.setTenantId(tenantId);
            notice.setToName(toName);
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

        // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById（前置校验）
        Long tenantId = UserContext.tenantId();
        CuttingTask task = cuttingTaskService.lambdaQuery()
                .eq(CuttingTask::getId, taskId)
                .eq(CuttingTask::getTenantId, tenantId)
                .one();
        if (task == null) {
            throw new NoSuchElementException("裁剪任务不存在");
        }

        if (scanRecordDomainService.hasProductionTypeScanRecords(task.getProductionOrderId())) {
            throw new IllegalStateException("该裁剪任务已存在生产扫码记录，无法退回");
        }

        boolean ok = cuttingTaskService.rollbackTask(taskId);
        if (!ok) {
            throw new IllegalStateException("退回失败");
        }

        markCustomCutOrderScrapped(task, reason);

        cuttingTaskService.insertRollbackLog(task, currentUserId, currentUsername, reason);

        // P1 多租户隔离：退回后重新查询也带 tenantId
        CuttingTask updated = cuttingTaskService.lambdaQuery()
                .eq(CuttingTask::getId, taskId)
                .eq(CuttingTask::getTenantId, tenantId)
                .one();
        if (updated == null) {
            throw new IllegalStateException("退回失败");
        }

        logAppendHelper.appendCancel(taskId, reason);
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

        // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById
        Long tenantId = UserContext.tenantId();
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getId, task.getProductionOrderId().trim())
                .eq(ProductionOrder::getTenantId, tenantId)
                .one();
        if (order == null || order.getDeleteFlag() != 0) {
            return;
        }
        String currentStatus = order.getStatus() == null ? "" : order.getStatus().trim().toLowerCase();
        if ("scrapped".equals(currentStatus)) {
            return;
        }

        // P0-7: 状态机守卫校验（宽松模式：仅 warn，不阻断裁剪退回的报废流程）
        // 此处是裁剪退回触发的隐式报废，业务上允许从 cutting/production 等活跃态报废
        orderStatusGuardHelper.warnIfIllegal(currentStatus, "scrapped", "cuttingRollbackScrap");

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
        // P0 修复（铁律4 多租户隔离）：强制租户上下文校验 + 显式 tenantId 过滤
        Long tenantId = TenantAssert.requireTenantId();
        UserContext ctx = UserContext.get();
        String userId = ctx == null ? null : ctx.getUserId();
        if (!StringUtils.hasText(userId)) {
            return new ArrayList<>();
        }

        // 同时返回「待领取的任务」+「我已领取的任务」
        // 修复前只返回 status=received 的任务,导致小程序看不到「领取任务」按钮
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
                        CuttingTask::getExpectedShipDate,
                        CuttingTask::getStatus
                )
                // P0 修复：显式 tenantId 过滤，避免跨租户读取
                .eq(CuttingTask::getTenantId, tenantId)
                .and(w -> w
                        .isNull(CuttingTask::getReceiverId).eq(CuttingTask::getStatus, "pending")
                        .or()
                        .eq(CuttingTask::getReceiverId, userId).eq(CuttingTask::getStatus, "received"))
                // 待领取(pending)排在前面,已领取(received)排在后面
                .orderByAsc(CuttingTask::getStatus)
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

        // P0 修复：校验订单归属当前租户
        Set<String> validOrderIds = productionOrderService.lambdaQuery()
            .select(ProductionOrder::getId)
                .in(ProductionOrder::getId, orderIds)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived", "scrapped")
                .list()
                .stream()
                .map(ProductionOrder::getId)
                .collect(Collectors.toSet());

        List<CuttingTask> result = tasks.stream()
                .filter(task -> validOrderIds.contains(task.getProductionOrderId()))
                .collect(Collectors.toList());

        // 注入款式图（coverImage/styleCover）供小程序通知卡片展示
        injectStyleCover(result, tenantId);

        return result;
    }

    /**
     * 批量注入款式图（styleCover）到裁剪任务列表
     * 根据 styleNo 关联查询 StyleInfo.cover，填充到 @TableField(exist=false) styleCover 字段
     */
    private void injectStyleCover(List<CuttingTask> taskList, Long tenantId) {
        if (taskList == null || taskList.isEmpty() || tenantId == null) return;
        Set<String> styleNos = taskList.stream()
                .map(CuttingTask::getStyleNo)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        if (styleNos.isEmpty()) return;

        try {
            Map<String, String> styleNoToCover = styleInfoService.lambdaQuery()
                    .select(com.fashion.supplychain.style.entity.StyleInfo::getStyleNo,
                            com.fashion.supplychain.style.entity.StyleInfo::getCover)
                    .in(com.fashion.supplychain.style.entity.StyleInfo::getStyleNo, styleNos)
                    .eq(com.fashion.supplychain.style.entity.StyleInfo::getTenantId, tenantId)
                    .list()
                    .stream()
                    .filter(s -> StringUtils.hasText(s.getStyleNo()) && StringUtils.hasText(s.getCover()))
                    .collect(Collectors.toMap(
                            com.fashion.supplychain.style.entity.StyleInfo::getStyleNo,
                            com.fashion.supplychain.style.entity.StyleInfo::getCover,
                            (v1, v2) -> v1));

            if (!styleNoToCover.isEmpty()) {
                taskList.forEach(task -> {
                    if (StringUtils.hasText(task.getStyleNo())) {
                        String cover = styleNoToCover.get(task.getStyleNo());
                        if (cover != null) {
                            task.setStyleCover(cover);
                        }
                    }
                });
            }
        } catch (Exception e) {
            log.warn("[CuttingTask] 注入款式图失败（不影响主流程）: styleNos={}, err={}", styleNos, e.getMessage());
        }
    }
}
