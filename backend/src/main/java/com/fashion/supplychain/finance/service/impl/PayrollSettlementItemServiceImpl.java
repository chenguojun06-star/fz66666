package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.PayrollSettlementItem;
import com.fashion.supplychain.finance.mapper.PayrollSettlementItemMapper;
import com.fashion.supplychain.finance.service.PayrollSettlementItemService;
import org.springframework.stereotype.Service;

@Service
public class PayrollSettlementItemServiceImpl extends ServiceImpl<PayrollSettlementItemMapper, PayrollSettlementItem>
        implements PayrollSettlementItemService {
}
