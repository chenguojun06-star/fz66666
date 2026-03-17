package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.CrewSession;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * Agentic Crew Graph 会话 Mapper。
 */
@Mapper
public interface CrewSessionMapper extends BaseMapper<CrewSession> {

    /** 查询最近 N 次会话的路由分布（供 CriticEvolution 自学习参考）*/
    @Select("SELECT route_decision, COUNT(*) AS cnt," +
            " ROUND(AVG(health_score)) AS avgHealth," +
            " COUNT(CASE WHEN status='COMPLETED' THEN 1 END) AS completed" +
            " FROM t_crew_session" +
            " WHERE tenant_id=#{tenantId}" +
            " AND created_at >= DATE_SUB(NOW(), INTERVAL #{days} DAY)" +
            " GROUP BY route_decision ORDER BY cnt DESC")
    List<Map<String, Object>> selectRouteStats(@Param("tenantId") Long tenantId,
                                               @Param("days") int days);

    /** 查询近 N 条健康分低于阈值的失败会话（触发自进化）*/
    @Select("SELECT id, natural_goal, plan_json, health_score, critic_insight" +
            " FROM t_crew_session" +
            " WHERE tenant_id=#{tenantId}" +
            " AND health_score < #{threshold}" +
            " AND status != 'PENDING'" +
            " ORDER BY created_at DESC LIMIT #{limit}")
    List<Map<String, Object>> selectLowHealthSessions(
            @Param("tenantId") Long tenantId,
            @Param("threshold") int threshold,
            @Param("limit") int limit);
}
