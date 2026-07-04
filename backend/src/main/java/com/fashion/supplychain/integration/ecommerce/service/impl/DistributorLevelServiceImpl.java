package com.fashion.supplychain.integration.ecommerce.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.ecommerce.entity.DistributorLevel;
import com.fashion.supplychain.integration.ecommerce.mapper.DistributorLevelMapper;
import com.fashion.supplychain.integration.ecommerce.service.DistributorLevelService;
import org.springframework.stereotype.Service;

@Service
public class DistributorLevelServiceImpl
        extends ServiceImpl<DistributorLevelMapper, DistributorLevel>
        implements DistributorLevelService {
}
