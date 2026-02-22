package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.PayrollSettlementItem;
import com.fashion.supplychain.finance.mapper.PayrollSettlementItemMapper;
import com.fashion.supplychain.finance.service.PayrollSettlementItemService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class PayrollSettlementItemServiceImpl extends ServiceImpl<PayrollSettlementItemMapper, PayrollSettlementItem>
        implements PayrollSettlementItemService {

    @Override
    public void deleteByOrderId(String orderId) {
        if (!StringUtils.hasText(orderId)) return;
        remove(new LambdaQueryWrapper<PayrollSettlementItem>()
                .eq(PayrollSettlementItem::getOrderId, orderId));
    }
}
