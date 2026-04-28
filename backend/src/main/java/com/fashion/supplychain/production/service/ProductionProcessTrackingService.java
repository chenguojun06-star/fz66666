package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.mapper.ProductionProcessTrackingMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ProductionProcessTrackingService extends ServiceImpl<ProductionProcessTrackingMapper, ProductionProcessTracking> {

    public int batchInsert(List<ProductionProcessTracking> records) {
        if (records == null || records.isEmpty()) {
            return 0;
        }
        return baseMapper.batchInsert(records);
    }

    public List<ProductionProcessTracking> getByOrderId(String productionOrderId) {
        return baseMapper.selectByOrderId(productionOrderId, UserContext.tenantId());
    }

    public List<ProductionProcessTracking> getByOrderIdAndTenant(String productionOrderId, Long tenantId) {
        return baseMapper.selectByOrderId(productionOrderId, tenantId);
    }

    public List<ProductionProcessTracking> listByOrderIdAndTenant(String productionOrderId, Long tenantId) {
        return lambdaQuery()
                .eq(ProductionProcessTracking::getProductionOrderId, productionOrderId)
                .eq(tenantId != null, ProductionProcessTracking::getTenantId, tenantId)
                .orderByAsc(ProductionProcessTracking::getBundleNo)
                .orderByAsc(ProductionProcessTracking::getProcessOrder)
                .list();
    }

    public List<ProductionProcessTracking> getByBundleId(String cuttingBundleId) {
        return baseMapper.selectByBundleId(cuttingBundleId, UserContext.tenantId());
    }

    public ProductionProcessTracking getByBundleAndProcess(String cuttingBundleId, String processCode) {
        return baseMapper.selectByBundleAndProcess(cuttingBundleId, processCode, UserContext.tenantId());
    }

    public ProductionProcessTracking getByBundleAndProcessName(String cuttingBundleId, String processName) {
        return baseMapper.selectByBundleAndProcessName(cuttingBundleId, processName, UserContext.tenantId());
    }

    public int deleteByOrderNo(String productionOrderNo) {
        return baseMapper.deleteByOrderNo(productionOrderNo, UserContext.tenantId());
    }
}
