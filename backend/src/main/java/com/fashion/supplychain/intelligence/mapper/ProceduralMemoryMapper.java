package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.ProceduralMemory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

/**
 * L4程序性记忆 Mapper
 *
 * @author xiaoyun
 * @since 2026-06-24
 */
@Mapper
public interface ProceduralMemoryMapper extends BaseMapper<ProceduralMemory> {

    /**
     * 根据关键词搜索SOP（P0铁律4：多租户隔离）
     * 匹配逻辑：租户自己的 SOP (tenant_id=#{tenantId}) 或 公共 SOP (tenant_id=0)
     *
     * @param tenantId 租户ID
     * @param keyword 关键词
     * @return 匹配的SOP列表
     */
    @Select("<script>" +
            "SELECT * FROM t_procedural_memory " +
            "WHERE (tenant_id = #{tenantId} OR tenant_id = 0) " +
            "  AND enabled = 1 " +
            "  AND delete_flag = 0 " +
            "  AND confidence >= 0.60 " +
            "  AND (trigger_keywords LIKE CONCAT('%', #{keyword}, '%') " +
            "       OR sop_name LIKE CONCAT('%', #{keyword}, '%')) " +
            "ORDER BY tenant_id DESC, confidence DESC, usage_count DESC " +
            "LIMIT 3" +
            "</script>")
    List<ProceduralMemory> searchByKeyword(@Param("tenantId") Long tenantId, @Param("keyword") String keyword);

    /**
     * 根据SOP类型查询（匹配租户自己的 + 公共SOP）
     *
     * @param tenantId 租户ID
     * @param sopType SOP类型
     * @return SOP（置信度最高的）
     */
    @Select("SELECT * FROM t_procedural_memory " +
            "WHERE (tenant_id = #{tenantId} OR tenant_id = 0) " +
            "  AND sop_type = #{sopType} " +
            "  AND enabled = 1 " +
            "  AND delete_flag = 0 " +
            "ORDER BY tenant_id DESC, confidence DESC " +
            "LIMIT 1")
    ProceduralMemory findBySopType(@Param("tenantId") Long tenantId, @Param("sopType") String sopType);

    /**
     * 更新调用统计
     *
     * @param id SOP ID
     * @param success 是否成功
     */
    @Select("UPDATE t_procedural_memory " +
            "SET usage_count = usage_count + 1, " +
            "    success_count = success_count + #{success}, " +
            "    confidence = LEAST(1.00, success_count + #{success} + 0.70) / (usage_count + 1) " +
            "WHERE id = #{id}")
    void updateUsageStats(@Param("id") Long id, @Param("success") Integer success);
}
