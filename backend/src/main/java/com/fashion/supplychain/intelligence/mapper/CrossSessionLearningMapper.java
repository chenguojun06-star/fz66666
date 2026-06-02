package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.CrossSessionLearningEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface CrossSessionLearningMapper extends BaseMapper<CrossSessionLearningEntity> {

    @Select("SELECT * FROM t_cross_session_learning WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND status = 'active' AND delete_flag = 0 ORDER BY confidence DESC, hit_count DESC LIMIT #{limit}")
    List<CrossSessionLearningEntity> findActiveByUser(@Param("tenantId") Long tenantId,
                                                          @Param("userId") String userId,
                                                          @Param("limit") int limit);

    @Select("SELECT * FROM t_cross_session_learning WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND learning_key = #{learningKey} AND learning_type = #{learningType} AND delete_flag = 0 LIMIT 1")
    CrossSessionLearningEntity findByKey(@Param("tenantId") Long tenantId,
                                            @Param("userId") String userId,
                                            @Param("learningKey") String learningKey,
                                            @Param("learningType") String learningType);

    @Update("UPDATE t_cross_session_learning SET hit_count = hit_count + 1, last_used_at = NOW() WHERE id = #{id}")
    int incrementHit(@Param("id") Long id);
}
