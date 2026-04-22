package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.AiDecisionCard;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;
import java.util.Map;

@Mapper
public interface AiDecisionCardMapper extends BaseMapper<AiDecisionCard> {

    /** 采纳率聚合（按场景） */
    @Select("SELECT scene, COUNT(*) AS total, "
        + "SUM(CASE WHEN adopted = 1 THEN 1 ELSE 0 END) AS adopted_count, "
        + "SUM(CASE WHEN adopted = -1 THEN 1 ELSE 0 END) AS rejected_count "
        + "FROM t_ai_decision_card "
        + "WHERE create_time >= #{since} "
        + "GROUP BY scene")
    List<Map<String, Object>> aggregateAdoptionByScene(@Param("since") java.time.LocalDateTime since);
}
