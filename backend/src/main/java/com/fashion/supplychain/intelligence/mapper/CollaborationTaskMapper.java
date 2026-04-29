package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.CollaborationTask;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface CollaborationTaskMapper extends BaseMapper<CollaborationTask> {

    @Select("SELECT * FROM t_collaboration_task WHERE tenant_id = #{tenantId} AND order_no = #{orderNo} AND target_role = #{targetRole} ORDER BY updated_at DESC LIMIT 1")
    CollaborationTask findByTenantAndOrderAndRole(@Param("tenantId") Long tenantId, @Param("orderNo") String orderNo, @Param("targetRole") String targetRole);

    @Select("SELECT * FROM t_collaboration_task WHERE tenant_id = #{tenantId} ORDER BY updated_at DESC LIMIT #{limit}")
    List<CollaborationTask> findRecentByTenant(@Param("tenantId") Long tenantId, @Param("limit") int limit);

    @Select("SELECT * FROM t_collaboration_task WHERE tenant_id = #{tenantId} AND order_no = #{orderNo} ORDER BY updated_at DESC LIMIT #{limit}")
    List<CollaborationTask> findByTenantAndOrder(@Param("tenantId") Long tenantId, @Param("orderNo") String orderNo, @Param("limit") int limit);
}
