package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.ProceduralMemory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * L4 程序性记忆 Mapper
 */
@Mapper
public interface ProceduralMemoryMapper extends BaseMapper<ProceduralMemory> {

    @Select("SELECT * FROM t_procedural_memory " +
            "WHERE tenant_id = #{tenantId} AND delete_flag = 0 AND enabled = 1 " +
            "AND trigger_keywords LIKE CONCAT('%', #{keyword}, '%') " +
            "ORDER BY confidence DESC LIMIT 10")
    List<ProceduralMemory> findByKeyword(@Param("tenantId") Long tenantId, @Param("keyword") String keyword);

    @Select("SELECT * FROM t_procedural_memory " +
            "WHERE tenant_id = #{tenantId} AND delete_flag = 0 AND enabled = 1 " +
            "AND sop_type = #{sopType} " +
            "ORDER BY confidence DESC")
    List<ProceduralMemory> findBySopType(@Param("tenantId") Long tenantId, @Param("sopType") String sopType);

    @Select("SELECT * FROM t_procedural_memory " +
            "WHERE tenant_id = #{tenantId} AND delete_flag = 0 AND enabled = 1 " +
            "ORDER BY usage_count DESC LIMIT 20")
    List<ProceduralMemory> findTopUsed(@Param("tenantId") Long tenantId);

    @Update("UPDATE t_procedural_memory SET usage_count = usage_count + 1 WHERE id = #{id}")
    int incrementUsageCount(@Param("id") Long id);

    @Update("UPDATE t_procedural_memory SET success_count = success_count + 1 WHERE id = #{id}")
    int incrementSuccessCount(@Param("id") Long id);
}
