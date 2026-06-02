package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.KgSnapshotEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface KgSnapshotMapper extends BaseMapper<KgSnapshotEntity> {

    @Select("SELECT COUNT(*) FROM t_kg_snapshot WHERE tenant_id = #{tenantId} AND relation_type = #{relationType} AND delete_flag = #{deleteFlag}")
    int countByTenantAndType(@Param("tenantId") Long tenantId,
                                @Param("relationType") String relationType,
                                @Param("deleteFlag") Integer deleteFlag);

    @Select("SELECT * FROM t_kg_snapshot WHERE tenant_id = #{tenantId} AND relation_type = #{relationType} AND delete_flag = #{deleteFlag} ORDER BY create_time DESC LIMIT 1")
    KgSnapshotEntity findLatest(@Param("tenantId") Long tenantId,
                                  @Param("relationType") String relationType,
                                  @Param("deleteFlag") Integer deleteFlag);

    @Select("SELECT * FROM t_kg_snapshot WHERE tenant_id = #{tenantId} AND delete_flag = 0 ORDER BY create_time DESC LIMIT 50")
    List<KgSnapshotEntity> findRecentByTenant(@Param("tenantId") Long tenantId);
}
