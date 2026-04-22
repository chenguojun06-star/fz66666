package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.AiPatrolAction;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;
import java.util.Map;

@Mapper
public interface AiPatrolActionMapper extends BaseMapper<AiPatrolAction> {

    /** MTTR 平均/分位（按 issue_type 维度） */
    @Select("SELECT issue_type, COUNT(*) AS total, "
        + "AVG(mttr_minutes) AS avg_mttr, "
        + "SUM(CASE WHEN status='CLOSED' OR status='AUTO_EXECUTED' THEN 1 ELSE 0 END) AS closed_count "
        + "FROM t_ai_patrol_action "
        + "WHERE create_time >= #{since} "
        + "GROUP BY issue_type")
    List<Map<String, Object>> aggregateMttrByIssueType(@Param("since") java.time.LocalDateTime since);
}
