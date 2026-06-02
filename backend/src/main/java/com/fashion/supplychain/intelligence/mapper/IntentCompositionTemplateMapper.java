package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.IntentCompositionTemplateEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface IntentCompositionTemplateMapper extends BaseMapper<IntentCompositionTemplateEntity> {

    @Select("SELECT * FROM t_intent_composition_template WHERE tenant_id = #{tenantId} AND enabled = 1 AND delete_flag = 0 ORDER BY priority DESC")
    List<IntentCompositionTemplateEntity> findEnabledByTenant(@Param("tenantId") Long tenantId);

    @Update("UPDATE t_intent_composition_template SET hit_count = hit_count + 1, last_hit_at = NOW() WHERE id = #{id}")
    int incrementHit(@Param("id") Long id);
}
