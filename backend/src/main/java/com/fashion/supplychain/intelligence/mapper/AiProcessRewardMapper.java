package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.AiProcessReward;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;
import java.util.Map;

@Mapper
public interface AiProcessRewardMapper extends BaseMapper<AiProcessReward> {

    /**
     * 工具命中率排行（指定时间窗口内）。仅超管聚合用。
     */
    @Select("SELECT tool_name, COUNT(*) AS total, "
        + "SUM(CASE WHEN score > 0 THEN 1 ELSE 0 END) AS positive, "
        + "AVG(score) AS avg_score "
        + "FROM t_ai_process_reward "
        + "WHERE create_time >= #{since} "
        + "GROUP BY tool_name "
        + "ORDER BY positive DESC, avg_score DESC")
    List<Map<String, Object>> aggregateToolPerformance(@Param("since") java.time.LocalDateTime since);

    /**
     * 单租户工具表现切片
     */
    @Select("SELECT tool_name, COUNT(*) AS total, AVG(score) AS avg_score "
        + "FROM t_ai_process_reward "
        + "WHERE tenant_id = #{tenantId} AND create_time >= #{since} "
        + "GROUP BY tool_name ORDER BY avg_score DESC")
    List<Map<String, Object>> aggregateToolByTenant(@Param("tenantId") Long tenantId,
                                                     @Param("since") java.time.LocalDateTime since);
}
