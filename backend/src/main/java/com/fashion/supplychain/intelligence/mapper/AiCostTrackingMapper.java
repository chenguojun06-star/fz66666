package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.AiCostTracking;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface AiCostTrackingMapper extends BaseMapper<AiCostTracking> {

    @Select("SELECT COALESCE(SUM(total_tokens), 0) FROM t_ai_cost_tracking WHERE tenant_id = #{tenantId} AND created_at >= #{since}")
    long sumTokensSince(@Param("tenantId") Long tenantId, @Param("since") java.time.LocalDateTime since);

    @Select("SELECT COALESCE(SUM(estimated_cost_usd), 0) FROM t_ai_cost_tracking WHERE tenant_id = #{tenantId} AND created_at >= #{since}")
    java.math.BigDecimal sumCostSince(@Param("tenantId") Long tenantId, @Param("since") java.time.LocalDateTime since);
}
