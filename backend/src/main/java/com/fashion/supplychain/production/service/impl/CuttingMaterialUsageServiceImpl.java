package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingMaterialUsage;
import com.fashion.supplychain.production.mapper.CuttingMaterialUsageMapper;
import com.fashion.supplychain.production.service.CuttingMaterialUsageService;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class CuttingMaterialUsageServiceImpl
        extends ServiceImpl<CuttingMaterialUsageMapper, CuttingMaterialUsage>
        implements CuttingMaterialUsageService {

    @Override
    public List<CuttingMaterialUsage> listByCuttingTaskId(String cuttingTaskId) {
        if (cuttingTaskId == null || cuttingTaskId.trim().isEmpty()) {
            return java.util.Collections.emptyList();
        }
        Long tenantId = UserContext.tenantId();
        return lambdaQuery()
                .eq(CuttingMaterialUsage::getCuttingTaskId, cuttingTaskId.trim())
                .eq(tenantId != null, CuttingMaterialUsage::getTenantId, tenantId)
                .orderByAsc(CuttingMaterialUsage::getMaterialCode)
                .list();
    }
}
