package com.fashion.supplychain.integration.ecommerce.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.integration.ecommerce.entity.DistributorProfile;

import java.math.BigDecimal;
import java.util.List;

/**
 * 分销商档案 Service
 */
public interface DistributorProfileService extends IService<DistributorProfile> {

    /** 列表查询 */
    default List<DistributorProfile> listByTenant(Long tenantId, String keyword, String level, String status) {
        return list(new LambdaQueryWrapper<DistributorProfile>()
                .eq(DistributorProfile::getTenantId, tenantId)
                .eq(DistributorProfile::getDeleteFlag, 0)
                .like(keyword != null && !keyword.isBlank(), DistributorProfile::getDistributorName, keyword)
                .eq(level != null && !level.isBlank(), DistributorProfile::getDistributorLevel, level)
                .eq(status != null && !status.isBlank(), DistributorProfile::getStatus, status)
                .orderByDesc(DistributorProfile::getCreateTime));
    }

    /** 检查分销商编号是否存在 */
    default boolean existsByNo(Long tenantId, String distributorNo) {
        return count(new LambdaQueryWrapper<DistributorProfile>()
                .eq(DistributorProfile::getTenantId, tenantId)
                .eq(DistributorProfile::getDistributorNo, distributorNo)
                .eq(DistributorProfile::getDeleteFlag, 0)) > 0;
    }

    /** 根据ID查询单条（带租户校验） */
    default DistributorProfile getByIdAndTenant(Long tenantId, Long id) {
        return getOne(new LambdaQueryWrapper<DistributorProfile>()
                .eq(DistributorProfile::getTenantId, tenantId)
                .eq(DistributorProfile::getId, id)
                .eq(DistributorProfile::getDeleteFlag, 0), false);
    }

    /** 占用信用额度 */
    default boolean occupyCredit(Long tenantId, Long distributorId, BigDecimal amount) {
        DistributorProfile d = getByIdAndTenant(tenantId, distributorId);
        if (d == null) return false;
        BigDecimal newUsed = (d.getUsedCredit() != null ? d.getUsedCredit() : BigDecimal.ZERO).add(amount);
        // 检查是否超出额度（0 表示不限额）
        if (d.getCreditLimit() != null && d.getCreditLimit().compareTo(BigDecimal.ZERO) > 0
                && newUsed.compareTo(d.getCreditLimit()) > 0) {
            return false;
        }
        d.setUsedCredit(newUsed);
        return updateById(d);
    }

    /** 释放信用额度 */
    default boolean releaseCredit(Long tenantId, Long distributorId, BigDecimal amount) {
        DistributorProfile d = getByIdAndTenant(tenantId, distributorId);
        if (d == null) return false;
        BigDecimal newUsed = (d.getUsedCredit() != null ? d.getUsedCredit() : BigDecimal.ZERO).subtract(amount);
        if (newUsed.compareTo(BigDecimal.ZERO) < 0) newUsed = BigDecimal.ZERO;
        d.setUsedCredit(newUsed);
        return updateById(d);
    }
}
