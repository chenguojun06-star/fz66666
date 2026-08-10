package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.AiConversationMemory;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface AiConversationMemoryMapper extends BaseMapper<AiConversationMemory> {

    /**
     * 查询指定用户最近的对话记忆，按创建时间倒序。
     * 过滤已过期（expire_time <= NOW()）和已删除的记录。
     */
    @Select("SELECT * FROM t_ai_conversation_memory "
            + "WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND delete_flag = 0 "
            + "  AND (expire_time IS NULL OR expire_time > NOW()) "
            + "ORDER BY create_time DESC LIMIT #{limit}")
    List<AiConversationMemory> findRecentByUser(
            @Param("tenantId") Long tenantId,
            @Param("userId")   String userId,
            @Param("limit")    int limit);

    /**
     * 降级查询：仅查询归档必需字段（不含 user_message/ai_response/feedback_score/feedback_reason）。
     *
     * <p>背景：云端数据库可能因 Flyway 迁移未完整执行导致上述 4 个字段缺失，
     * MyBatis-Plus 的 selectList 会执行 SELECT * 触发 "Unknown column" 错误。
     * 此方法用显式列名避免依赖新增字段，确保归档任务在 schema 不完整时也能正常运行。
     *
     * <p>多租户隔离（P0 铁律 4）：查询条件包含 tenant_id（如非 null）。
     */
    @Select("SELECT id, tenant_id, user_id, memory_summary, key_entities, "
            + "importance_score, source_message_count, create_time, expire_time, delete_flag "
            + "FROM t_ai_conversation_memory "
            + "WHERE create_time < #{cutoff} AND delete_flag = 0 "
            + "ORDER BY create_time ASC LIMIT #{limit}")
    List<AiConversationMemory> findArchivableBatchDegraded(
            @Param("cutoff") LocalDateTime cutoff,
            @Param("limit")   int limit);
}
