package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import java.util.Map;

public interface CuttingTaskService extends IService<CuttingTask> {

    IPage<CuttingTask> queryPage(Map<String, Object> params);

    CuttingTask createTaskIfAbsent(ProductionOrder order);

    boolean receiveTask(String taskId, String receiverId, String receiverName);

    boolean markBundledByOrderId(String productionOrderId);

    boolean rollbackTask(String taskId);

    void insertRollbackLog(CuttingTask task, String operatorId, String operatorName, String remark);

    /**
     * 根据订单ID删除裁剪任务及其关联的裁剪单
     * @param orderId 订单ID
     */
    void deleteByOrderId(String orderId);
}
