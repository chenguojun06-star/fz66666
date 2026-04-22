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

    @Select("SELECT trace_id, trace_url, scene, provider, model, success, fallback_used, latency_ms, tool_call_count, error_message, user_id, create_time " +
            "FROM t_intelligence_metrics " +
            "WHERE tenant_id = #{tenantId} " +
            "AND delete_flag = 0 " +
            "ORDER BY create_time DESC LIMIT #{limit}")
    List<Map<String, Object>> listRecentInvocations(@Param("tenantId") Long tenantId,
                                                    @Param("limit") int limit);

    /**
     * 采纳率统计（供 AiAccuracyOrchestrator 使用）
     * 返回 map 含 adopted（采纳次数）、total（有明确反馈的总次数）
     */
    @Select("SELECT "
            + "  SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) AS adopted, "
            + "  COUNT(*) AS total "
            + "FROM t_intelligence_metrics "
            + "WHERE tenant_id = #{tenantId} "
            + "  AND accepted IS NOT NULL "
            + "  AND delete_flag = 0 "
            + "  AND create_time >= DATE_SUB(NOW(), INTERVAL #{days} DAY)")
    Map<String, Object> getAdoptionStats(@Param("tenantId") Long tenantId, @Param("days") int days);
}
