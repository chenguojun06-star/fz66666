package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.KgRelation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface KgRelationMapper extends BaseMapper<KgRelation> {

    @Select("SELECT * FROM t_kg_relation WHERE source_id = #{sourceId} AND delete_flag = 0")
    List<KgRelation> findBySourceId(@Param("sourceId") Long sourceId);

    @Select("""
        SELECT r.* FROM t_kg_relation r
        JOIN t_kg_entity s ON r.source_id = s.id AND s.delete_flag = 0
        JOIN t_kg_entity t ON r.target_id = t.id AND t.delete_flag = 0
        WHERE r.tenant_id = #{tenantId} AND r.delete_flag = 0
        ORDER BY r.weight DESC
        LIMIT #{limit}
        """)
    List<KgRelation> findTopRelations(@Param("tenantId") Long tenantId, @Param("limit") int limit);
}
