package com.fashion.supplychain.integration.ecommerce.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.ecommerce.entity.DistributorPricePolicy;
import com.fashion.supplychain.integration.ecommerce.mapper.DistributorPricePolicyMapper;
import com.fashion.supplychain.integration.ecommerce.service.DistributorPricePolicyService;
import org.springframework.stereotype.Service;

@Service
public class DistributorPricePolicyServiceImpl
        extends ServiceImpl<DistributorPricePolicyMapper, DistributorPricePolicy>
        implements DistributorPricePolicyService {
}
