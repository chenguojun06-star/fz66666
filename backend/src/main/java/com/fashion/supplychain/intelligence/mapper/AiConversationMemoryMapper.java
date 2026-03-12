package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.AiConversationMemory;
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
}
