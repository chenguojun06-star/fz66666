package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.PromptVariantEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface PromptVariantMapper extends BaseMapper<PromptVariantEntity> {

    @Select("SELECT * FROM t_prompt_variant WHERE tenant_id = #{tenantId} AND intent = #{intent} AND status = 'active' AND delete_flag = #{deleteFlag} ORDER BY avg_score DESC")
    List<PromptVariantEntity> findActiveByIntent(@Param("tenantId") Long tenantId,
                                                    @Param("intent") String intent,
                                                    @Param("deleteFlag") Integer deleteFlag);

    @Update("UPDATE t_prompt_variant SET hit_count = hit_count + 1 WHERE id = #{id}")
    int incrementHit(@Param("id") Long id);

    @Update("UPDATE t_prompt_variant SET total_score = #{totalScore}, avg_score = #{avgScore}, last_evaluated_at = NOW() WHERE id = #{id}")
    int updateScore(@Param("id") Long id,
                       @Param("totalScore") double totalScore,
                       @Param("avgScore") double avgScore);
}
