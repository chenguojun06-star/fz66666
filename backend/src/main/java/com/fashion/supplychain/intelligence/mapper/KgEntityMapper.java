package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.KgEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface KgEntityMapper extends BaseMapper<KgEntity> {

    @Select("""
        WITH RECURSIVE graph_path AS (
            SELECT e.id, e.entity_name, e.entity_type, r.relation_type, r.target_id, 1 AS hop
            FROM t_kg_entity e
            JOIN t_kg_relation r ON r.source_id = e.id
            WHERE e.id = #{startId} AND e.delete_flag = 0 AND r.delete_flag = 0
            UNION ALL
            SELECT child.id, child.entity_name, child.entity_type, child_r.relation_type, child_r.target_id, gp.hop + 1
            FROM graph_path gp
            JOIN t_kg_entity child ON child.id = gp.target_id AND child.delete_flag = 0
            JOIN t_kg_relation child_r ON child_r.source_id = child.id AND child_r.delete_flag = 0
            WHERE gp.hop < #{maxHops}
        )
        SELECT id, entity_name, entity_type, relation_type, target_id, hop
        FROM graph_path
        """)
    List<Map<String, Object>> traverseGraph(@Param("startId") Long startId, @Param("maxHops") int maxHops);
}
