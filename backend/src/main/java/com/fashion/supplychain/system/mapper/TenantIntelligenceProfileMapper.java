package com.fashion.supplychain.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.system.entity.TenantIntelligenceProfile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface TenantIntelligenceProfileMapper extends BaseMapper<TenantIntelligenceProfile> {

    @Select("SELECT * FROM t_tenant_intelligence_profile WHERE tenant_id = #{tenantId} LIMIT 1")
    TenantIntelligenceProfile selectAnyByTenantId(@Param("tenantId") Long tenantId);

    @Update("UPDATE t_tenant_intelligence_profile SET delete_flag = 0 WHERE tenant_id = #{tenantId} AND delete_flag <> 0")
    int reviveByTenantId(@Param("tenantId") Long tenantId);
}
