package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.SharedAgentMemory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 多 Agent 共享记忆 Mapper。
 *
 * <p>多租户隔离（P0 铁律 4）：所有自定义查询带 tenant_id WHERE。
 */
@Mapper
public interface SharedAgentMemoryMapper extends BaseMapper<SharedAgentMemory> {

    /**
     * 按会话查询所有事实（多租户隔离，未过期）。
     */
    @Select("SELECT * FROM t_shared_agent_memory " +
            "WHERE tenant_id = #{tenantId} AND session_id = #{sessionId} " +
            "AND (expire_time IS NULL OR expire_time > NOW()) " +
            "ORDER BY create_time ASC")
    List<SharedAgentMemory> findFactsBySession(@Param("tenantId") Long tenantId,
                                                 @Param("sessionId") String sessionId);

    /**
     * 按会话 + fact_key 查询（多租户隔离）。
     */
    @Select("SELECT * FROM t_shared_agent_memory " +
            "WHERE tenant_id = #{tenantId} AND session_id = #{sessionId} " +
            "AND fact_key = #{factKey} " +
            "AND (expire_time IS NULL OR expire_time > NOW()) LIMIT 1")
    SharedAgentMemory findFact(@Param("tenantId") Long tenantId,
                                @Param("sessionId") String sessionId,
                                @Param("factKey") String factKey);

    /**
     * 清理过期记录（会话结束 24h 后）。
     */
    @Update("DELETE FROM t_shared_agent_memory WHERE expire_time < NOW()")
    int purgeExpired();
}
