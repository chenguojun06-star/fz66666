package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.baomidou.mybatisplus.core.metadata.IPage;
import java.math.BigDecimal;
import java.util.Map;

/**
 * 生产订单Service接口
 */
public interface ProductionOrderService extends IService<ProductionOrder> {

    /**
     * 分页查询生产订单
     */
    IPage<ProductionOrder> queryPage(Map<String, Object> params);

    /**
     * 根据ID查询生产订单详情
     */
    ProductionOrder getDetailById(String id);

    /**
     * 保存或更新生产订单
     */
    boolean saveOrUpdateOrder(ProductionOrder productionOrder);

    /**
     * 根据ID删除生产订单
     */
    boolean deleteById(String id);

    /**
     * 更新生产进度
     */
    boolean updateProductionProgress(String id, Integer progress);

    boolean updateProductionProgress(String id, Integer progress, String rollbackRemark, String rollbackToProcessName);

    boolean completeProduction(String id, BigDecimal tolerancePercent);

    ProductionOrder closeOrder(String id);

    ProductionOrder recomputeProgressFromRecords(String orderId);

    /**
     * 异步重新计算订单进度
     */
    void recomputeProgressAsync(String orderId);

    /**
     * 更新物料到位率
     */
    boolean updateMaterialArrivalRate(String id, Integer rate);

    /**
     * 根据订单号查询生产订单
     */
    ProductionOrder getByOrderNo(String orderNo);
}
