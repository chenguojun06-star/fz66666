package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.BargainPrice;
import com.fashion.supplychain.finance.mapper.BargainPriceMapper;
import com.fashion.supplychain.finance.service.BargainPriceService;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class BargainPriceServiceImpl extends ServiceImpl<BargainPriceMapper, BargainPrice> implements BargainPriceService {

    @Override
    public List<BargainPrice> listByTarget(String targetType, String targetId) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<BargainPrice> qw = new LambdaQueryWrapper<BargainPrice>()
                .eq(BargainPrice::getTargetType, targetType)
                .eq(BargainPrice::getTargetId, targetId)
                .eq(BargainPrice::getTenantId, tenantId)
                .eq(BargainPrice::getDeleteFlag, 0)
                .orderByDesc(BargainPrice::getCreateTime);
        return list(qw);
    }

    @Override
    public BargainPrice getLatestApproved(String targetType, String targetId) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<BargainPrice> qw = new LambdaQueryWrapper<BargainPrice>()
                .eq(BargainPrice::getTargetType, targetType)
                .eq(BargainPrice::getTargetId, targetId)
                .eq(BargainPrice::getStatus, "approved")
                .eq(BargainPrice::getTenantId, tenantId)
                .eq(BargainPrice::getDeleteFlag, 0)
                .orderByDesc(BargainPrice::getCreateTime)
                .last("LIMIT 1");
        return getOne(qw);
    }
}