package com.fashion.supplychain.integration.ecommerce.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.ecommerce.entity.EcWarehouseAllocation;
import com.fashion.supplychain.integration.ecommerce.mapper.EcWarehouseAllocationMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
public class EcWarehouseAllocationService extends ServiceImpl<EcWarehouseAllocationMapper, EcWarehouseAllocation> {

    public List<EcWarehouseAllocation> listByOrderId(Long tenantId, Long orderId) {
        return list(new LambdaQueryWrapper<EcWarehouseAllocation>()
                .eq(EcWarehouseAllocation::getTenantId, tenantId)
                .eq(EcWarehouseAllocation::getOrderId, orderId)
                .orderByDesc(EcWarehouseAllocation::getCreateTime));
    }

    public List<EcWarehouseAllocation> listByTenant(Long tenantId) {
        return list(new LambdaQueryWrapper<EcWarehouseAllocation>()
                .eq(EcWarehouseAllocation::getTenantId, tenantId)
                .orderByDesc(EcWarehouseAllocation::getCreateTime));
    }
}
