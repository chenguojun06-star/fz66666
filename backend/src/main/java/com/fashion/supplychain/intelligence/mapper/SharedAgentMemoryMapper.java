package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.SharedAgentMemory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface SharedAgentMemoryMapper extends BaseMapper<SharedAgentMemory> {

    /**
     * 读取会话内所有有效事实（未过期）
     */
    @Select("SELECT * FROM t_shared_agent_memory WHERE tenant_id = #{tenantId} AND session_id = #{sessionId} AND (expire_time IS NULL OR expire_time > NOW())")
    List<SharedAgentMemory> findBySession(@Param("tenantId") Long tenantId, @Param("sessionId") String sessionId);

    /**
     * 清理过期记忆
     */
    @Update("DELETE FROM t_shared_agent_memory WHERE expire_time < NOW()")
    int purgeExpired();
}
