package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.IntelligenceMetrics;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;
import java.util.Map;

@Mapper
public interface IntelligenceMetricsMapper extends BaseMapper<IntelligenceMetrics> {

    /**
     * 按场景聚合最近N天的调用统计
     */
    @Select("SELECT scene, " +
            "COUNT(*) AS total_calls, " +
            "SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count, " +
            "ROUND(AVG(latency_ms), 0) AS avg_latency_ms, " +
            "SUM(CASE WHEN fallback_used = 1 THEN 1 ELSE 0 END) AS fallback_count " +
            "FROM t_intelligence_metrics " +
            "WHERE tenant_id = #{tenantId} " +
            "AND create_time >= DATE_SUB(NOW(), INTERVAL #{days} DAY) " +
            "AND delete_flag = 0 " +
            "GROUP BY scene ORDER BY total_calls DESC")
    List<Map<String, Object>> aggregateByScene(@Param("tenantId") Long tenantId,
                                                @Param("days") int days);
}
