package com.fashion.supplychain.integration.ecommerce.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.ecommerce.entity.EcLogisticsAnomaly;
import com.fashion.supplychain.integration.ecommerce.mapper.EcLogisticsAnomalyMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Phase 3 物流异常预警 Service
 */
@Slf4j
@Service
public class EcLogisticsAnomalyService extends ServiceImpl<EcLogisticsAnomalyMapper, EcLogisticsAnomaly> {

    /** 查询未处理异常（按严重度倒序） */
    public List<EcLogisticsAnomaly> listUnhandled(Long tenantId) {
        return list(new LambdaQueryWrapper<EcLogisticsAnomaly>()
                .eq(EcLogisticsAnomaly::getTenantId, tenantId)
                .eq(EcLogisticsAnomaly::getHandledStatus, 0)
                .orderByDesc(EcLogisticsAnomaly::getSeverity)
                .orderByDesc(EcLogisticsAnomaly::getCreateTime));
    }

    /** 查询全部异常（含已处理） */
    public List<EcLogisticsAnomaly> listAll(Long tenantId) {
        return list(new LambdaQueryWrapper<EcLogisticsAnomaly>()
                .eq(EcLogisticsAnomaly::getTenantId, tenantId)
                .orderByDesc(EcLogisticsAnomaly::getCreateTime));
    }

    /** 判断同订单同异常类型是否存在未处理记录（去重用） */
    public boolean existsUnhandled(Long tenantId, Long orderId, String anomalyType) {
        return count(new LambdaQueryWrapper<EcLogisticsAnomaly>()
                .eq(EcLogisticsAnomaly::getTenantId, tenantId)
                .eq(EcLogisticsAnomaly::getOrderId, orderId)
                .eq(EcLogisticsAnomaly::getAnomalyType, anomalyType)
                .eq(EcLogisticsAnomaly::getHandledStatus, 0)) > 0;
    }

    /** 标记处理 */
    public void markHandled(Long tenantId, Long id, String handledBy, String remark) {
        EcLogisticsAnomaly update = new EcLogisticsAnomaly();
        update.setId(id);
        update.setTenantId(tenantId);
        update.setHandledStatus(1);
        update.setHandledBy(handledBy);
        update.setHandledRemark(remark);
        update.setHandledTime(java.time.LocalDateTime.now());
        updateById(update);
    }

    /** 忽略 */
    public void markIgnored(Long tenantId, Long id, String handledBy, String remark) {
        EcLogisticsAnomaly update = new EcLogisticsAnomaly();
        update.setId(id);
        update.setTenantId(tenantId);
        update.setHandledStatus(2);
        update.setHandledBy(handledBy);
        update.setHandledRemark(remark);
        update.setHandledTime(java.time.LocalDateTime.now());
        updateById(update);
    }
}
