package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.PushTimingEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface PushTimingMapper extends BaseMapper<PushTimingEntity> {

    @Select("SELECT * FROM t_push_timing WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND push_type = #{pushType} AND delete_flag = 0 LIMIT 1")
    PushTimingEntity findByUserAndType(@Param("tenantId") Long tenantId,
                                          @Param("userId") String userId,
                                          @Param("pushType") String pushType);

    @Select("SELECT * FROM t_push_timing WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND enabled = 1 AND delete_flag = 0")
    List<PushTimingEntity> findEnabledByUser(@Param("tenantId") Long tenantId,
                                                  @Param("userId") String userId);

    @Update("UPDATE t_push_timing SET push_count = push_count + 1, last_push_at = NOW() WHERE id = #{id}")
    int incrementPush(@Param("id") Long id);

    @Update("UPDATE t_push_timing SET open_count = open_count + 1, open_rate = (open_count + 1) / GREATEST(push_count, 1) WHERE id = #{id}")
    int incrementOpen(@Param("id") Long id);
}
