package com.fashion.supplychain.integration.ecommerce.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.ecommerce.entity.EcPlatformBill;
import com.fashion.supplychain.integration.ecommerce.mapper.EcPlatformBillMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Phase 3 平台账单 Service
 */
@Slf4j
@Service
public class EcPlatformBillService extends ServiceImpl<EcPlatformBillMapper, EcPlatformBill> {

    /** 查询待处理账单 */
    public List<EcPlatformBill> listPending(Long tenantId) {
        return list(new LambdaQueryWrapper<EcPlatformBill>()
                .eq(EcPlatformBill::getTenantId, tenantId)
                .eq(EcPlatformBill::getHandledStatus, 0)
                .orderByDesc(EcPlatformBill::getDiffAmount)
                .orderByDesc(EcPlatformBill::getCreateTime));
    }

    /** 查询全部账单 */
    public List<EcPlatformBill> listAll(Long tenantId) {
        return list(new LambdaQueryWrapper<EcPlatformBill>()
                .eq(EcPlatformBill::getTenantId, tenantId)
                .orderByDesc(EcPlatformBill::getCreateTime));
    }

    /** 按账期查询 */
    public List<EcPlatformBill> listByPeriod(Long tenantId, String billPeriod) {
        return list(new LambdaQueryWrapper<EcPlatformBill>()
                .eq(EcPlatformBill::getTenantId, tenantId)
                .eq(EcPlatformBill::getBillPeriod, billPeriod)
                .orderByDesc(EcPlatformBill::getDiffAmount));
    }

    /** 判断同账期同订单是否已存在（去重） */
    public boolean existsByPeriodAndOrder(Long tenantId, String platform, String billPeriod, String platformOrderNo) {
        return count(new LambdaQueryWrapper<EcPlatformBill>()
                .eq(EcPlatformBill::getTenantId, tenantId)
                .eq(EcPlatformBill::getPlatform, platform)
                .eq(EcPlatformBill::getBillPeriod, billPeriod)
                .eq(EcPlatformBill::getPlatformOrderNo, platformOrderNo)) > 0;
    }

    /** 标记处理状态 */
    public void markHandled(Long tenantId, Long id, int status, String handledBy, String remark) {
        EcPlatformBill update = new EcPlatformBill();
        update.setId(id);
        update.setTenantId(tenantId);
        update.setHandledStatus(status);
        update.setHandledBy(handledBy);
        update.setHandledTime(java.time.LocalDateTime.now());
        updateById(update);
    }
}
