package com.fashion.supplychain.integration.openapi.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.openapi.entity.TenantAppLog;
import com.fashion.supplychain.integration.openapi.mapper.TenantAppLogMapper;
import com.fashion.supplychain.integration.openapi.service.TenantAppLogService;
import org.springframework.stereotype.Service;

@Service
public class TenantAppLogServiceImpl extends ServiceImpl<TenantAppLogMapper, TenantAppLog> implements TenantAppLogService {
}
