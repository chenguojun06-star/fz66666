package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.CollaborationTask;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface CollaborationTaskMapper extends BaseMapper<CollaborationTask> {

    @Select("SELECT * FROM t_collaboration_task WHERE tenant_id = #{tenantId} AND order_no = #{orderNo} AND target_role = #{targetRole} ORDER BY updated_at DESC LIMIT 1")
    CollaborationTask findByTenantAndOrderAndRole(@Param("tenantId") Long tenantId, @Param("orderNo") String orderNo, @Param("targetRole") String targetRole);

    @Select("SELECT * FROM t_collaboration_task WHERE tenant_id = #{tenantId} ORDER BY updated_at DESC LIMIT #{limit}")
    List<CollaborationTask> findRecentByTenant(@Param("tenantId") Long tenantId, @Param("limit") int limit);

    @Select("SELECT * FROM t_collaboration_task WHERE tenant_id = #{tenantId} AND order_no = #{orderNo} ORDER BY updated_at DESC LIMIT #{limit}")
    List<CollaborationTask> findByTenantAndOrder(@Param("tenantId") Long tenantId, @Param("orderNo") String orderNo, @Param("limit") int limit);

    @Select("SELECT * FROM t_collaboration_task WHERE tenant_id = #{tenantId} AND task_status IN ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'ESCALATED') ORDER BY FIELD(priority, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'), due_at ASC LIMIT #{limit}")
    List<CollaborationTask> findActiveByTenant(@Param("tenantId") Long tenantId, @Param("limit") int limit);

    @Select("SELECT * FROM t_collaboration_task WHERE tenant_id = #{tenantId} AND task_status = #{status} ORDER BY FIELD(priority, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'), due_at ASC LIMIT #{limit}")
    List<CollaborationTask> findByTenantAndStatus(@Param("tenantId") Long tenantId, @Param("status") String status, @Param("limit") int limit);

    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM t_collaboration_task WHERE tenant_id = #{tenantId} AND overdue = 1 AND task_status IN ('PENDING', 'ACCEPTED', 'IN_PROGRESS') AND escalated_at IS NULL ORDER BY FIELD(priority, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'), due_at ASC LIMIT #{limit}")
    List<CollaborationTask> findOverdueNotEscalated(@Param("tenantId") Long tenantId, @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM t_collaboration_task WHERE tenant_id = #{tenantId} AND task_status = #{status}")
    int countByTenantAndStatus(@Param("tenantId") Long tenantId, @Param("status") String status);

    @Update("UPDATE t_collaboration_task SET task_status = 'ESCALATED', escalated_at = NOW(), escalated_to = #{escalatedTo}, updated_at = NOW() WHERE id = #{id}")
    int escalateTask(@Param("id") Long id, @Param("escalatedTo") String escalatedTo);
}
