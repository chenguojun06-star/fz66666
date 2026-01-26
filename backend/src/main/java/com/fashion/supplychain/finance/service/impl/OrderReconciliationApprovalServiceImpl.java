package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.OrderReconciliationApproval;
import com.fashion.supplychain.finance.mapper.OrderReconciliationApprovalMapper;
import com.fashion.supplychain.finance.service.OrderReconciliationApprovalService;
import org.springframework.stereotype.Service;

/**
 * 订单结算审批付款 Service 实现
 */
@Service
public class OrderReconciliationApprovalServiceImpl
        extends ServiceImpl<OrderReconciliationApprovalMapper, OrderReconciliationApproval>
        implements OrderReconciliationApprovalService {
}
