package com.fashion.supplychain.integration.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.entity.LogisticsProvider;
import com.fashion.supplychain.integration.mapper.LogisticsProviderMapper;
import com.fashion.supplychain.integration.service.LogisticsProviderService;
import org.springframework.stereotype.Service;

@Service
public class LogisticsProviderServiceImpl extends ServiceImpl<LogisticsProviderMapper, LogisticsProvider> implements LogisticsProviderService {
}
