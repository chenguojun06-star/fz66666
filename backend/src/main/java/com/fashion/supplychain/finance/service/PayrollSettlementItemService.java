package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.finance.entity.PayrollSettlementItem;

public interface PayrollSettlementItemService extends IService<PayrollSettlementItem> {

    /**
     * 按订单ID删除工资结算明细（用于订单级联清理）
     */
    void deleteByOrderId(String orderId);
}
