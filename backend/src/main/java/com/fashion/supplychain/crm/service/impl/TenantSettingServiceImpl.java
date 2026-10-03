package com.fashion.supplychain.crm.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.crm.entity.TenantSetting;
import com.fashion.supplychain.crm.mapper.TenantSettingMapper;
import com.fashion.supplychain.crm.service.TenantSettingService;
import org.springframework.stereotype.Service;

@Service
public class TenantSettingServiceImpl extends ServiceImpl<TenantSettingMapper, TenantSetting>
        implements TenantSettingService {
}
