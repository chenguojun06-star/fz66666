package com.fashion.supplychain.integration.ecommerce.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.ecommerce.entity.EcOrderSplit;
import com.fashion.supplychain.integration.ecommerce.mapper.EcOrderSplitMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
public class EcOrderSplitService extends ServiceImpl<EcOrderSplitMapper, EcOrderSplit> {

    public List<EcOrderSplit> listByOriginalOrderId(Long tenantId, Long originalOrderId) {
        return list(new LambdaQueryWrapper<EcOrderSplit>()
                .eq(EcOrderSplit::getTenantId, tenantId)
                .eq(EcOrderSplit::getOriginalOrderId, originalOrderId)
                .orderByAsc(EcOrderSplit::getCreateTime));
    }

    public List<EcOrderSplit> listByTenant(Long tenantId) {
        return list(new LambdaQueryWrapper<EcOrderSplit>()
                .eq(EcOrderSplit::getTenantId, tenantId)
                .orderByDesc(EcOrderSplit::getCreateTime));
    }
}
