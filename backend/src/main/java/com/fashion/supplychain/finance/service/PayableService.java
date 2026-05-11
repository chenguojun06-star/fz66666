package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.finance.entity.Payable;

import java.math.BigDecimal;

public interface PayableService extends IService<Payable> {
    int atomicAddPaidAmount(String id, BigDecimal delta);
}
