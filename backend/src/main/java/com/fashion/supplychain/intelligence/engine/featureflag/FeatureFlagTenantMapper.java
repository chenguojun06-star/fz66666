package com.fashion.supplychain.intelligence.engine.featureflag;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface FeatureFlagTenantMapper {
    int countTenantFlag(@Param("tenantId") Long tenantId, @Param("feature") String feature);
    Boolean getTenantFlag(@Param("tenantId") Long tenantId, @Param("feature") String feature);
    int upsertTenantFlag(@Param("tenantId") Long tenantId, @Param("feature") String feature, @Param("enabled") boolean enabled);
}
