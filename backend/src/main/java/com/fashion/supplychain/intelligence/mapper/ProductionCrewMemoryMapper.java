package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.ProductionCrewMemory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 生产Crew记忆数据访问层。
 */
@Mapper
public interface ProductionCrewMemoryMapper extends BaseMapper<ProductionCrewMemory> {

    /**
     * 查询某租户最近N条危险级别记忆（用于CriticEvolution复盘）。
     */
    @Select("SELECT order_no, health_score, route, plan, action_json, create_time " +
            "FROM t_production_crew_memory " +
            "WHERE tenant_id = #{tenantId} AND health_score < #{threshold} " +
            "ORDER BY create_time DESC LIMIT #{limit}")
    List<Map<String, Object>> selectDangerMemories(@Param("tenantId") Long tenantId,
                                                    @Param("threshold") int threshold,
                                                    @Param("limit") int limit);
}
