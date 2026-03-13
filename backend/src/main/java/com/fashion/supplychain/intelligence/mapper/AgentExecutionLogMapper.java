package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.AgentExecutionLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface AgentExecutionLogMapper extends BaseMapper<AgentExecutionLog> {

    /** 按 scene 聚合 A/B 测试统计（最近 N 天） */
    @Select("SELECT scene," +
            " COUNT(*) AS totalRuns," +
            " SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) AS successCount," +
            " ROUND(AVG(latency_ms)) AS avgLatencyMs," +
            " ROUND(AVG(confidence_score)) AS avgConfidence," +
            " COUNT(user_feedback) AS feedbackCount," +
            " ROUND(AVG(user_feedback),1) AS avgFeedback" +
            " FROM t_agent_execution_log" +
            " WHERE tenant_id=#{tenantId} AND create_time >= DATE_SUB(NOW(), INTERVAL #{days} DAY)" +
            " GROUP BY scene ORDER BY totalRuns DESC")
    List<Map<String, Object>> selectAbStatsByScene(@Param("tenantId") Long tenantId,
                                                   @Param("days") int days);
}
