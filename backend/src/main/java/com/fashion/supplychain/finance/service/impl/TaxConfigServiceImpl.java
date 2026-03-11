package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.TaxConfig;
import com.fashion.supplychain.finance.mapper.TaxConfigMapper;
import com.fashion.supplychain.finance.service.TaxConfigService;
import org.springframework.stereotype.Service;

@Service
public class TaxConfigServiceImpl extends ServiceImpl<TaxConfigMapper, TaxConfig> implements TaxConfigService {
}
