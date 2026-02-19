package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.WagePayment;
import com.fashion.supplychain.finance.mapper.WagePaymentMapper;
import org.springframework.stereotype.Service;

/**
 * 工资支付记录Service - 单领域CRUD
 * 复杂业务逻辑请通过 WagePaymentOrchestrator 编排
 */
@Service
public class WagePaymentService extends ServiceImpl<WagePaymentMapper, WagePayment> {
}
