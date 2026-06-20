package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.ProceduralMemory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * L4 程序性记忆 Mapper。
 *
 * <p>多租户隔离（P0 铁律 4）：所有自定义查询带 tenant_id WHERE。
 */
@Mapper
public interface ProceduralMemoryMapper extends BaseMapper<ProceduralMemory> {

    /**
     * 按租户 + SOP 类型查询启用的 SOP（多租户隔离）。
     * 同时返回租户自定义 SOP 和公共 SOP（tenant_id=0）。
     */
    @Select("SELECT * FROM t_procedural_memory " +
            "WHERE tenant_id IN (0, #{tenantId}) AND sop_type = #{sopType} " +
            "AND enabled = 1 AND delete_flag = 0 ORDER BY confidence DESC")
    List<ProceduralMemory> findEnabledByTenantAndType(@Param("tenantId") Long tenantId,
                                                       @Param("sopType") String sopType);

    /**
     * 按 trigger_keywords LIKE 匹配（多租户隔离）。
     * 同时返回租户自定义 SOP 和公共 SOP（tenant_id=0）。
     * 任一关键词命中即返回。
     */
    @Select("SELECT * FROM t_procedural_memory " +
            "WHERE tenant_id IN (0, #{tenantId}) AND enabled = 1 AND delete_flag = 0 " +
            "AND trigger_keywords LIKE CONCAT('%', #{keyword}, '%') " +
            "ORDER BY confidence DESC LIMIT 10")
    List<ProceduralMemory> findByTriggerKeyword(@Param("tenantId") Long tenantId,
                                                  @Param("keyword") String keyword);

    /**
     * 调用次数 +1；success=true 时 success_count 也 +1。
     * 用原子 SQL 避免 read-modify-write 并发问题（D-008）。
     */
    @Update("UPDATE t_procedural_memory SET usage_count = usage_count + 1 " +
            "WHERE id = #{id}")
    int incrUsageCount(@Param("id") Long id);

    @Update("UPDATE t_procedural_memory SET usage_count = usage_count + 1, " +
            "success_count = success_count + 1 WHERE id = #{id}")
    int incrUsageAndSuccessCount(@Param("id") Long id);

    /**
     * 统计租户启用 SOP 数量（D-021 统一可观测用）。
     */
    @Select("SELECT COUNT(*) FROM t_procedural_memory " +
            "WHERE tenant_id = #{tenantId} AND enabled = 1 AND delete_flag = 0")
    long countEnabledByTenant(@Param("tenantId") Long tenantId);
}
