package com.fashion.supplychain.integration.openapi.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface TenantAppMapper extends BaseMapper<TenantApp> {

    @Update("UPDATE t_tenant_app SET " +
            "daily_used = COALESCE(daily_used, 0) + 1, " +
            "total_calls = COALESCE(total_calls, 0) + 1, " +
            "last_call_time = NOW() " +
            "WHERE id = #{id}")
    int atomicIncrementCallCount(@Param("id") String id);
}
