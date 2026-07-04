package com.fashion.supplychain.integration.ecommerce.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.ecommerce.entity.DistributorProfile;
import com.fashion.supplychain.integration.ecommerce.mapper.DistributorProfileMapper;
import com.fashion.supplychain.integration.ecommerce.service.DistributorProfileService;
import org.springframework.stereotype.Service;

@Service
public class DistributorProfileServiceImpl
        extends ServiceImpl<DistributorProfileMapper, DistributorProfile>
        implements DistributorProfileService {
}
