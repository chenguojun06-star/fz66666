package com.fashion.supplychain.integration.ecommerce.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.integration.ecommerce.entity.DistributorLevel;

import java.util.List;

/**
 * 分销商等级 Service
 */
public interface DistributorLevelService extends IService<DistributorLevel> {

    /** 列表查询（按排序） */
    default List<DistributorLevel> listEnabled(Long tenantId) {
        return list(new LambdaQueryWrapper<DistributorLevel>()
                .eq(DistributorLevel::getTenantId, tenantId)
                .eq(DistributorLevel::getDeleteFlag, 0)
                .eq(DistributorLevel::getEnabled, 1)
                .orderByAsc(DistributorLevel::getSortOrder));
    }

    /** 检查等级编码是否存在 */
    default boolean existsByCode(Long tenantId, String levelCode) {
        return count(new LambdaQueryWrapper<DistributorLevel>()
                .eq(DistributorLevel::getTenantId, tenantId)
                .eq(DistributorLevel::getLevelCode, levelCode)
                .eq(DistributorLevel::getDeleteFlag, 0)) > 0;
    }
}
