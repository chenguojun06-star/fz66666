package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import java.math.BigDecimal;
import java.util.Map;

public interface PayrollSettlementService extends IService<PayrollSettlement> {
    IPage<PayrollSettlement> queryPage(Map<String, Object> params);

    PayrollSettlement getDetailById(String id);

    void deleteByOrderId(String orderId);

    int atomicAddPaidAmount(String id, BigDecimal delta, BigDecimal expectedPaidAmount);

    int atomicAddDeductionAmount(String id, BigDecimal delta, BigDecimal expectedDeductionAmount);
}
