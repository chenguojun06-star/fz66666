package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.finance.entity.Payable;

import java.math.BigDecimal;

public interface PayableService extends IService<Payable> {
    int atomicAddPaidAmount(String id, BigDecimal delta, Long tenantId);

    /**
     * 原子累加退货冲减金额（独立于 paid_amount）
     * 用于采购退货时记录供应商应退回的金额
     */
    int atomicAddReturnedAmount(String id, BigDecimal delta, Long tenantId);
}
