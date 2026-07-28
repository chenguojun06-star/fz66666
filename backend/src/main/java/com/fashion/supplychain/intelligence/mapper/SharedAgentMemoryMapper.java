package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.SharedAgentMemory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
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

    /**
     * P3-1 滑动续期：读取命中时延长过期时间（仅延长尚未过期的记录）
     *
     * <p>限制：只更新 expire_time &lt;= #{maxExpire} 的记录，防止无限续期。
     * 单条事实最长生命周期 = maxExpire（从 createTime 起算）。
     *
     * @param tenantId   租户ID
     * @param sessionId  会话ID
     * @param newExpire  新过期时间（NOW + 24h）
     * @param maxExpire  最大允许过期时间（createTime + 7 天，硬上限）
     * @return 续期行数
     */
    @Update("UPDATE t_shared_agent_memory SET expire_time = #{newExpire} " +
            "WHERE tenant_id = #{tenantId} AND session_id = #{sessionId} " +
            "AND (expire_time IS NULL OR expire_time > NOW()) " +
            "AND expire_time < #{maxExpire}")
    int extendExpire(@Param("tenantId") Long tenantId,
                     @Param("sessionId") String sessionId,
                     @Param("newExpire") LocalDateTime newExpire,
                     @Param("maxExpire") LocalDateTime maxExpire);
}
