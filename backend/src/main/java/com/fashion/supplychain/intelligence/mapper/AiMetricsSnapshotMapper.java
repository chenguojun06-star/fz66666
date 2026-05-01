package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.AiMetricsSnapshot;
import java.time.LocalDate;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface AiMetricsSnapshotMapper extends BaseMapper<AiMetricsSnapshot> {

    @Select("SELECT * FROM t_ai_metrics_snapshot WHERE tenant_id = #{tenantId} AND snapshot_date >= #{since} ORDER BY snapshot_date DESC LIMIT #{limit}")
    List<AiMetricsSnapshot> findRecentByTenant(@Param("tenantId") Long tenantId, @Param("since") LocalDate since, @Param("limit") int limit);

    @Select("SELECT * FROM t_ai_metrics_snapshot WHERE tenant_id IS NULL AND snapshot_date >= #{since} ORDER BY snapshot_date DESC LIMIT #{limit}")
    List<AiMetricsSnapshot> findRecentPlatform(@Param("since") LocalDate since, @Param("limit") int limit);

    @Select("SELECT * FROM t_ai_metrics_snapshot WHERE tenant_id = #{tenantId} AND snapshot_date = #{date} LIMIT 1")
    AiMetricsSnapshot findByTenantAndDate(@Param("tenantId") Long tenantId, @Param("date") LocalDate date);

    @Select("SELECT * FROM t_ai_metrics_snapshot WHERE tenant_id IS NULL AND snapshot_date = #{date} LIMIT 1")
    AiMetricsSnapshot findPlatformByDate(@Param("date") LocalDate date);
}
