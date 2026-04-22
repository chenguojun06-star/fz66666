package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.AiSkillNode;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface AiSkillNodeMapper extends BaseMapper<AiSkillNode> {

    /** 技能成功后递增计数并更新评分 */
    @Update("UPDATE t_ai_skill_node SET success_count = success_count + 1, "
            + "avg_score = (avg_score * success_count + #{score}) / (success_count + 1), "
            + "last_activated_at = NOW() "
            + "WHERE id = #{id}")
    int recordSuccess(@Param("id") Long id, @Param("score") int score);

    /** 技能失败后递增失败计数 */
    @Update("UPDATE t_ai_skill_node SET failure_count = failure_count + 1 WHERE id = #{id}")
    int recordFailure(@Param("id") Long id);
}
