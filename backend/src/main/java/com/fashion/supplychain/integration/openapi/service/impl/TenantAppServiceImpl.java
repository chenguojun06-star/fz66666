package com.fashion.supplychain.integration.openapi.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.integration.openapi.mapper.TenantAppMapper;
import com.fashion.supplychain.integration.openapi.service.TenantAppService;
import org.springframework.stereotype.Service;

@Service
public class TenantAppServiceImpl extends ServiceImpl<TenantAppMapper, TenantApp> implements TenantAppService {
}
