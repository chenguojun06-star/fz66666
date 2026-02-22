package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import java.util.Map;

public interface PayrollSettlementService extends IService<PayrollSettlement> {
    IPage<PayrollSettlement> queryPage(Map<String, Object> params);

    PayrollSettlement getDetailById(String id);

    /**
     * 按订单ID删除工资结算单（用于订单级联清理）
     */
    void deleteByOrderId(String orderId);
}
