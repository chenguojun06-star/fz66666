package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;

import java.util.Map;

public interface ShipmentReconciliationService extends IService<ShipmentReconciliation> {

    /**
     * 分页查询出货对账列表
     * @param params 查询参数
     * @return 分页结果
     */
    IPage<ShipmentReconciliation> queryPage(Map<String, Object> params);

    /**
     * 按订单ID物理删除所有出货对账记录
     */
    boolean removeByOrderId(String orderId);
}
