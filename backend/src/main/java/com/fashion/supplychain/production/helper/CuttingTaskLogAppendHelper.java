package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 裁剪任务操作日志追加
 * 双写策略：CuttingTask.remarks + ProductionOrder.remarks（用户要求所有操作记录都进订单备注时间线）
 */
@Slf4j
@Component
public class CuttingTaskLogAppendHelper {

    @Autowired
    private CuttingTaskService cuttingTaskService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private OrderRemarkHelper orderRemarkHelper;

    public void appendOperation(String taskId, String action, String detail) {
        if (taskId == null) return;
        // 1. 写 CuttingTask.remarks
        OperationLogAppendUtil.appendOperation(
            taskId,
            cuttingTaskService,
            CuttingTask::getRemarks,
            CuttingTask::setRemarks,
            action,
            detail,
            "裁剪任务"
        );
        // 2. 同步到 ProductionOrder.remarks
        syncToProductionOrder(taskId, action, detail);
    }

    /**
     * 仅同步到 ProductionOrder.remarks（用于已有 CuttingTask.remarks 写入的场景）
     */
    public void appendOrderOnly(String taskId, String action, String detail) {
        if (taskId == null) return;
        syncToProductionOrder(taskId, action, detail);
    }

    private void syncToProductionOrder(String taskId, String action, String detail) {
        try {
            CuttingTask task = cuttingTaskService.getById(taskId);
            if (task == null) return;
            String orderId = task.getProductionOrderId();
            if (orderId == null || orderId.trim().isEmpty()) return;
            ProductionOrder order = productionOrderService.getById(orderId.trim());
            if (order == null) return;
            String richDetail = detail;
            String receiverName = task.getReceiverName();
            if (receiverName != null && !receiverName.isEmpty()) {
                richDetail = (detail == null ? "" : detail) + "（裁剪员：" + receiverName + "）";
            }
            orderRemarkHelper.append(order, action, richDetail);
        } catch (Exception e) {
            log.debug("[CuttingLog] 同步到订单备注失败（不阻断）: taskId={}, action={}, err={}",
                    taskId, action, e.getMessage());
        }
    }

    public void appendCreate(String taskId) {
        appendOperation(taskId, "创建裁剪任务", null);
    }

    public void appendUpdate(String taskId, String fieldNames) {
        appendOperation(taskId, "修改裁剪任务", "更新字段：" + fieldNames);
    }

    public void appendStart(String taskId) {
        appendOperation(taskId, "开始裁剪", null);
    }

    public void appendComplete(String taskId) {
        appendOperation(taskId, "完成裁剪", null);
    }

    public void appendCancel(String taskId, String reason) {
        appendOperation(taskId, "取消裁剪", "原因：" + reason);
    }

    public void appendAssign(String taskId, String operator) {
        appendOperation(taskId, "分配裁剪员", "裁剪员：" + operator);
    }
}
