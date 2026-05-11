package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.mapper.PayableMapper;
import com.fashion.supplychain.finance.service.PayableService;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
public class PayableServiceImpl extends ServiceImpl<PayableMapper, Payable> implements PayableService {

    @Override
    public int atomicAddPaidAmount(String id, BigDecimal delta) {
        return baseMapper.atomicAddPaidAmount(id, delta);
    }
}
