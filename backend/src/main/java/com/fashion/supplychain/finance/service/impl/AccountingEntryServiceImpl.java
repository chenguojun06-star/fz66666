package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.AccountingEntry;
import com.fashion.supplychain.finance.mapper.AccountingEntryMapper;
import com.fashion.supplychain.finance.service.AccountingEntryService;
import org.springframework.stereotype.Service;

@Service
public class AccountingEntryServiceImpl extends ServiceImpl<AccountingEntryMapper, AccountingEntry> implements AccountingEntryService {
}
