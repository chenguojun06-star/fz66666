package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.AgentCheckpoint;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface AgentCheckpointMapper extends BaseMapper<AgentCheckpoint> {

    @Select("SELECT * FROM t_agent_checkpoint WHERE tenant_id = #{tenantId} AND thread_id = #{threadId} AND status = 'ACTIVE' ORDER BY step_index DESC LIMIT 1")
    AgentCheckpoint selectLatestActive(@Param("tenantId") Long tenantId, @Param("threadId") String threadId);

    @Select("SELECT COUNT(*) FROM t_agent_checkpoint WHERE tenant_id = #{tenantId} AND thread_id = #{threadId}")
    int countByThread(@Param("tenantId") Long tenantId, @Param("threadId") String threadId);
}
