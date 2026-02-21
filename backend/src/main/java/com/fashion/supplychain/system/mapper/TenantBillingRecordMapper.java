package com.fashion.supplychain.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.system.entity.TenantBillingRecord;
import org.apache.ibatis.annotations.Mapper;

/**
 * 租户计费记录Mapper
 */
@Mapper
public interface TenantBillingRecordMapper extends BaseMapper<TenantBillingRecord> {
}
