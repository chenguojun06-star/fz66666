package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.entity.CollaborationTask;
import com.fashion.supplychain.intelligence.mapper.CollaborationTaskMapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.context.annotation.Lazy;

@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class TaskOrderMonitorOrchestrator {

    private final CollaborationTaskMapper collaborationTaskMapper;
    private final ProductionOrderService productionOrderService;

    public static class OrderLinkStatus {
        public static final String NOT_LINKED = "NOT_LINKED";
        public static final String LINKED = "LINKED";
        public static final String INVALID_ORDER = "INVALID_ORDER";
        public static final String ORDER_COMPLETED = "ORDER_COMPLETED";
    }

    public static class ReminderType {
        public static final String OVERDUE = "OVERDUE";
        public static final String PROGRESS_CHANGE = "PROGRESS_CHANGE";
        public static final String STATUS_CHANGE = "STATUS_CHANGE";
        public static final String ESCALATION = "ESCALATION";
        public static final String DUE_SOON = "DUE_SOON";
    }

    public Map<String, Object> linkTaskToOrder(Long taskId, String orderNo) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        Map<String, Object> result = new HashMap<>();

        CollaborationTask task = collaborationTaskMapper.selectById(taskId);
        if (task == null || !tenantId.equals(task.getTenantId())) {
            result.put("success", false);
            result.put("error", "任务不存在或无权操作");
            return result;
        }

        if (!StringUtils.hasText(orderNo)) {
            task.setOrderNo(null);
            task.setStyleNo(null);
            task.setOrderLinkStatus(OrderLinkStatus.NOT_LINKED);
            task.setLastOrderProgress(null);
            task.setLastOrderStatus(null);
            collaborationTaskMapper.updateById(task);
            result.put("success", true);
            result.put("message", "已取消订单关联");
            return result;
        }

        LambdaQueryWrapper<ProductionOrder> query = new LambdaQueryWrapper<>();
        query.eq(ProductionOrder::getOrderNo, orderNo)
             .eq(ProductionOrder::getTenantId, tenantId)
             .eq(ProductionOrder::getDeleteFlag, 0)
             .last("LIMIT 1");
        ProductionOrder order = productionOrderService.getOne(query);

        if (order == null) {
            task.setOrderNo(orderNo);
            task.setOrderLinkStatus(OrderLinkStatus.INVALID_ORDER);
            collaborationTaskMapper.updateById(task);
            result.put("success", false);
            result.put("error", "订单号不存在");
            return result;
        }

        task.setOrderNo(orderNo);
        task.setStyleNo(order.getStyleNo());
        task.setOrderLinkStatus(OrderLinkStatus.LINKED);
        task.setLastOrderProgress(order.getProductionProgress());
        task.setLastOrderStatus(order.getStatus());
        task.setProgressChangeMonitorEnabled(true);
        collaborationTaskMapper.updateById(task);

        result.put("success", true);
        result.put("message", "订单关联成功");
        result.put("orderInfo", buildOrderInfo(order));
        return result;
    }

    public Map<String, Object> refreshTaskOrderStatus(Long taskId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        Map<String, Object> result = new HashMap<>();

        CollaborationTask task = collaborationTaskMapper.selectById(taskId);
        if (task == null || !tenantId.equals(task.getTenantId())) {
            result.put("success", false);
            result.put("error", "任务不存在或无权操作");
            return result;
        }

        if (!OrderLinkStatus.LINKED.equals(task.getOrderLinkStatus()) || !StringUtils.hasText(task.getOrderNo())) {
            result.put("success", true);
            result.put("message", "未关联订单");
            return result;
        }

        LambdaQueryWrapper<ProductionOrder> query = new LambdaQueryWrapper<>();
        query.eq(ProductionOrder::getOrderNo, task.getOrderNo())
             .eq(ProductionOrder::getTenantId, tenantId)
             .eq(ProductionOrder::getDeleteFlag, 0)
             .last("LIMIT 1");
        ProductionOrder order = productionOrderService.getOne(query);

        if (order == null) {
            task.setOrderLinkStatus(OrderLinkStatus.INVALID_ORDER);
            collaborationTaskMapper.updateById(task);
            result.put("success", true);
            result.put("orderInfo", null);
            result.put("changes", List.of("订单已失效"));
            return result;
        }

        List<String> changes = new ArrayList<>();

        if (order.getProductionProgress() != null && !order.getProductionProgress().equals(task.getLastOrderProgress())) {
            changes.add(String.format("进度变化: %d%% → %d%%",
                task.getLastOrderProgress() != null ? task.getLastOrderProgress() : 0,
                order.getProductionProgress()));
        }

        if (order.getStatus() != null && !order.getStatus().equals(task.getLastOrderStatus())) {
            changes.add(String.format("状态变化: %s → %s",
                task.getLastOrderStatus() != null ? task.getLastOrderStatus() : "未知",
                order.getStatus()));
        }

        if (order.getStyleNo() != null && !order.getStyleNo().equals(task.getStyleNo())) {
            task.setStyleNo(order.getStyleNo());
            changes.add("款号已同步");
        }

        task.setLastOrderProgress(order.getProductionProgress());
        task.setLastOrderStatus(order.getStatus());

        if (isOrderCompleted(order.getStatus())) {
            task.setOrderLinkStatus(OrderLinkStatus.ORDER_COMPLETED);
        }

        task.setUpdatedAt(LocalDateTime.now());
        collaborationTaskMapper.updateById(task);

        result.put("success", true);
        result.put("orderInfo", buildOrderInfo(order));
        result.put("changes", changes);
        result.put("hasChanges", !changes.isEmpty());
        return result;
    }

    public List<CollaborationTask> getTasksByOrderNo(String orderNo) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        LambdaQueryWrapper<CollaborationTask> query = new LambdaQueryWrapper<>();
        query.eq(CollaborationTask::getTenantId, tenantId)
             .eq(CollaborationTask::getOrderNo, orderNo)
             .orderByDesc(CollaborationTask::getCreatedAt)
             .last("LIMIT 100");
        return collaborationTaskMapper.selectList(query);
    }

    public List<CollaborationTask> getTasksNeedingOrderCheck(int limit) {
        LambdaQueryWrapper<CollaborationTask> query = new LambdaQueryWrapper<>();
        query.eq(CollaborationTask::getOrderLinkStatus, OrderLinkStatus.LINKED)
             .eq(CollaborationTask::getProgressChangeMonitorEnabled, true)
             .in(CollaborationTask::getTaskStatus,
                 CollaborationTask.TaskStatus.PENDING.name(),
                 CollaborationTask.TaskStatus.IN_PROGRESS.name(),
                 CollaborationTask.TaskStatus.ACCEPTED.name())
             .orderByAsc(CollaborationTask::getUpdatedAt)
             .last("LIMIT " + limit);
        return collaborationTaskMapper.selectList(query);
    }

    public void updateTaskReminderStats(Long taskId, String reminderType) {
        CollaborationTask task = collaborationTaskMapper.selectById(taskId);
        if (task == null) return;

        task.setLastReminderSentAt(LocalDateTime.now());
        task.setReminderCount(task.getReminderCount() == null ? 1 : task.getReminderCount() + 1);
        collaborationTaskMapper.updateById(task);
    }

    private Map<String, Object> buildOrderInfo(ProductionOrder order) {
        Map<String, Object> info = new HashMap<>();
        info.put("orderNo", order.getOrderNo());
        info.put("styleNo", order.getStyleNo());
        info.put("styleName", order.getStyleName());
        info.put("status", order.getStatus());
        info.put("progress", order.getProductionProgress());
        info.put("factoryName", order.getFactoryName());
        info.put("expectedShipDate", order.getExpectedShipDate());
        info.put("orderQuantity", order.getOrderQuantity());
        info.put("completedQuantity", order.getCompletedQuantity());
        return info;
    }

    private boolean isOrderCompleted(String status) {
        if (status == null) return false;
        return List.of("completed", "closed", "scrapped", "cancelled", "archived")
                   .contains(status.toLowerCase());
    }
}
