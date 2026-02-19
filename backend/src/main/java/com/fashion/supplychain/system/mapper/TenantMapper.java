package com.fashion.supplychain.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.system.entity.Tenant;
import org.apache.ibatis.annotations.Mapper;

/**
 * 租户Mapper接口
 */
@Mapper
public interface TenantMapper extends BaseMapper<Tenant> {
}
