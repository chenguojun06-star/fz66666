package com.fashion.supplychain.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.system.entity.TenantSubscription;
import org.apache.ibatis.annotations.Mapper;

/**
 * 租户订阅Mapper
 */
@Mapper
public interface TenantSubscriptionMapper extends BaseMapper<TenantSubscription> {
}
