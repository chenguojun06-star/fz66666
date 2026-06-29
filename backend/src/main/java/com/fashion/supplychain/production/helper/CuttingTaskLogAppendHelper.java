package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.service.CuttingTaskService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class CuttingTaskLogAppendHelper {

    @Autowired
    private CuttingTaskService cuttingTaskService;

    public void appendOperation(String taskId, String action, String detail) {
        if (taskId == null) return;
        OperationLogAppendUtil.appendOperation(
            taskId,
            cuttingTaskService,
            CuttingTask::getRemarks,
            CuttingTask::setRemarks,
            action,
            detail,
            "裁剪任务"
        );
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
