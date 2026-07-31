package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.AccountingVoucher;
import com.fashion.supplychain.finance.mapper.AccountingVoucherMapper;
import com.fashion.supplychain.finance.service.AccountingVoucherService;
import org.springframework.stereotype.Service;

@Service
public class AccountingVoucherServiceImpl extends ServiceImpl<AccountingVoucherMapper, AccountingVoucher> implements AccountingVoucherService {
}
