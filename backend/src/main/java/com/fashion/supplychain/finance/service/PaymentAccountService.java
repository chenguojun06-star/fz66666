package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.PaymentAccount;
import com.fashion.supplychain.finance.mapper.PaymentAccountMapper;
import org.springframework.stereotype.Service;

/**
 * 收款账户Service - 单领域CRUD
 * 复杂业务逻辑请通过 WagePaymentOrchestrator 编排
 */
@Service
public class PaymentAccountService extends ServiceImpl<PaymentAccountMapper, PaymentAccount> {
}
