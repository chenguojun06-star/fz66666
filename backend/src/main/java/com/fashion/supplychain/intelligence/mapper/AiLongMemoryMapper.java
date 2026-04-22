package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.AiLongMemory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface AiLongMemoryMapper extends BaseMapper<AiLongMemory> {

    /**
     * 命中后递增计数（避免锁）
     */
    @Update("UPDATE t_ai_long_memory SET hit_count = hit_count + 1, "
        + "last_hit_time = NOW() WHERE id = #{id}")
    int incrementHit(@Param("id") Long id);
}
