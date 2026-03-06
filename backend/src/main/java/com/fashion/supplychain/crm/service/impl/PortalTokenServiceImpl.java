package com.fashion.supplychain.crm.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.crm.entity.CustomerPortalToken;
import com.fashion.supplychain.crm.mapper.CustomerPortalTokenMapper;
import com.fashion.supplychain.crm.service.PortalTokenService;
import org.springframework.stereotype.Service;

@Service
public class PortalTokenServiceImpl extends ServiceImpl<CustomerPortalTokenMapper, CustomerPortalToken>
        implements PortalTokenService {
}
