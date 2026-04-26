package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.FinancePeriod;
import com.fashion.supplychain.finance.mapper.FinancePeriodMapper;
import com.fashion.supplychain.finance.service.FinancePeriodService;
import org.springframework.stereotype.Service;

@Service
public class FinancePeriodServiceImpl extends ServiceImpl<FinancePeriodMapper, FinancePeriod> implements FinancePeriodService {
}
