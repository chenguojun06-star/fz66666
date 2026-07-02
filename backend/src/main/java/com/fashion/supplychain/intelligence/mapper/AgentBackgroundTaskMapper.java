package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.AgentBackgroundTask;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

public interface AgentBackgroundTaskMapper extends BaseMapper<AgentBackgroundTask> {

    @Select("SELECT * FROM t_agent_background_task WHERE tenant_id = #{tenantId} AND status = 'PENDING' " +
            "AND delete_flag = 0 ORDER BY " +
            "CASE priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, " +
            "create_time ASC LIMIT #{limit}")
    List<AgentBackgroundTask> selectPendingTasks(@Param("tenantId") Long tenantId, @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM t_agent_background_task WHERE tenant_id = #{tenantId} AND status = 'RUNNING' AND delete_flag = 0")
    int countRunningTasks(@Param("tenantId") Long tenantId);

    @Update("UPDATE t_agent_background_task SET status = 'RUNNING', started_at = NOW(), retry_count = retry_count " +
            "WHERE task_id = #{taskId} AND status = 'PENDING' AND delete_flag = 0")
    int markAsRunning(@Param("taskId") String taskId);

    @Update("UPDATE t_agent_background_task SET status = 'COMPLETED', progress = 100, completed_at = NOW(), " +
            "result_json = #{resultJson}, current_step = '已完成' WHERE task_id = #{taskId} AND status = 'RUNNING' AND delete_flag = 0")
    int markAsCompleted(@Param("taskId") String taskId, @Param("resultJson") String resultJson);

    @Update("UPDATE t_agent_background_task SET status = 'FAILED', completed_at = NOW(), " +
            "error_message = #{errorMessage}, current_step = '执行失败' WHERE task_id = #{taskId} AND status = 'RUNNING' AND delete_flag = 0")
    int markAsFailed(@Param("taskId") String taskId, @Param("errorMessage") String errorMessage);

    @Update("UPDATE t_agent_background_task SET progress = #{progress}, current_step = #{currentStep} " +
            "WHERE task_id = #{taskId} AND status = 'RUNNING' AND delete_flag = 0")
    int updateProgress(@Param("taskId") String taskId, @Param("progress") int progress, @Param("currentStep") String currentStep);

    @Select("SELECT * FROM t_agent_background_task WHERE task_id = #{taskId} AND delete_flag = 0 LIMIT 1")
    AgentBackgroundTask selectByTaskId(@Param("taskId") String taskId);

    @Select("SELECT * FROM t_agent_background_task WHERE tenant_id = #{tenantId} AND delete_flag = 0 " +
            "AND status IN ('PENDING','RUNNING') ORDER BY " +
            "CASE priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, " +
            "create_time DESC LIMIT #{limit}")
    List<AgentBackgroundTask> selectActiveTasks(@Param("tenantId") Long tenantId, @Param("limit") int limit);

    @Select("SELECT * FROM t_agent_background_task WHERE tenant_id = #{tenantId} AND delete_flag = 0 " +
            "ORDER BY create_time DESC LIMIT #{offset}, #{limit}")
    List<AgentBackgroundTask> selectTaskList(@Param("tenantId") Long tenantId,
                                             @Param("offset") int offset,
                                             @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM t_agent_background_task WHERE tenant_id = #{tenantId} AND delete_flag = 0")
    int countByTenant(@Param("tenantId") Long tenantId);
}
