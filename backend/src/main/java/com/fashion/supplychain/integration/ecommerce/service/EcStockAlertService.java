package com.fashion.supplychain.integration.ecommerce.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.ecommerce.entity.EcStockAlert;
import com.fashion.supplychain.integration.ecommerce.mapper.EcStockAlertMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
public class EcStockAlertService extends ServiceImpl<EcStockAlertMapper, EcStockAlert> {

    public List<EcStockAlert> listUnresolved(Long tenantId) {
        return list(new LambdaQueryWrapper<EcStockAlert>()
                .eq(EcStockAlert::getTenantId, tenantId)
                .eq(EcStockAlert::getIsResolved, false)
                .orderByDesc(EcStockAlert::getCreateTime));
    }

    public List<EcStockAlert> listByTenant(Long tenantId) {
        return list(new LambdaQueryWrapper<EcStockAlert>()
                .eq(EcStockAlert::getTenantId, tenantId)
                .orderByDesc(EcStockAlert::getCreateTime));
    }

    public void resolveAlert(Long tenantId, Long alertId) {
        EcStockAlert alert = getById(alertId);
        if (alert != null && alert.getTenantId().equals(tenantId)) {
            alert.setIsResolved(true);
            alert.setResolvedTime(LocalDateTime.now());
            updateById(alert);
            log.info("[EcStockAlert] 预警已处理: alertId={}", alertId);
        }
    }

    public boolean existsUnresolved(Long tenantId, Long skuId, String alertType) {
        return count(new LambdaQueryWrapper<EcStockAlert>()
                .eq(EcStockAlert::getTenantId, tenantId)
                .eq(EcStockAlert::getSkuId, skuId)
                .eq(EcStockAlert::getAlertType, alertType)
                .eq(EcStockAlert::getIsResolved, false)) > 0;
    }
}
