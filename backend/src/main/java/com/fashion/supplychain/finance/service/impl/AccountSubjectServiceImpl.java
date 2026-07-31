package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.AccountSubject;
import com.fashion.supplychain.finance.mapper.AccountSubjectMapper;
import com.fashion.supplychain.finance.service.AccountSubjectService;
import org.springframework.stereotype.Service;

@Service
public class AccountSubjectServiceImpl extends ServiceImpl<AccountSubjectMapper, AccountSubject> implements AccountSubjectService {
}
