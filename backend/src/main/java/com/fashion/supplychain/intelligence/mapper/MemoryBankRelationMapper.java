package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.MemoryBankEntry;
import com.fashion.supplychain.intelligence.entity.MemoryBankRelation;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * Memory Bank 知识图谱关系 Mapper。
 *
 * <p>支持 CTE 递归查询实现图谱遍历（maxDepth ≤2 防爆炸）。
 * 多租户隔离：所有查询带 tenant_id WHERE（P0 铁律）。
 */
public interface MemoryBankRelationMapper extends BaseMapper<MemoryBankRelation> {

    /**
     * 查询某条目的出边关系（source = entryId）。
     */
    @Select("SELECT * FROM t_memory_bank_relation " +
            "WHERE tenant_id = #{tenantId} AND source_entry_id = #{entryId}")
    List<MemoryBankRelation> selectOutgoing(@Param("tenantId") Long tenantId,
                                             @Param("entryId") String entryId);

    /**
     * 查询某条目的入边关系（target = entryId）。
     */
    @Select("SELECT * FROM t_memory_bank_relation " +
            "WHERE tenant_id = #{tenantId} AND target_entry_id = #{entryId}")
    List<MemoryBankRelation> selectIncoming(@Param("tenantId") Long tenantId,
                                             @Param("entryId") String entryId);

    /**
     * CTE 递归遍历知识图谱（从 startEntryId 出发，maxDepth 跳）。
     *
     * <p>防爆炸：maxDepth 由调用方限制 ≤2。
     * 返回关联条目列表（不含起点本身）。
     */
    @Select("WITH RECURSIVE graph_traverse AS (" +
            "  SELECT target_entry_id AS entry_id, 1 AS depth " +
            "  FROM t_memory_bank_relation " +
            "  WHERE tenant_id = #{tenantId} AND source_entry_id = #{startEntryId} " +
            "  UNION ALL " +
            "  SELECT r.target_entry_id, gt.depth + 1 " +
            "  FROM t_memory_bank_relation r " +
            "  INNER JOIN graph_traverse gt ON r.source_entry_id = gt.entry_id " +
            "  WHERE r.tenant_id = #{tenantId} AND gt.depth < #{maxDepth} " +
            ") " +
            "SELECT DISTINCT e.* FROM t_memory_bank_entry e " +
            "INNER JOIN graph_traverse gt ON e.id = gt.entry_id " +
            "WHERE e.tenant_id = #{tenantId} AND e.delete_flag = 0")
    List<MemoryBankEntry> traverseGraph(@Param("tenantId") Long tenantId,
                                         @Param("startEntryId") String startEntryId,
                                         @Param("maxDepth") int maxDepth);

    /**
     * 统计租户关系数（D-021 统一可观测用）。
     */
    @Select("SELECT COUNT(*) FROM t_memory_bank_relation WHERE tenant_id = #{tenantId}")
    long countByTenant(@Param("tenantId") Long tenantId);

    /**
     * 检测孤儿关系（source 或 target 条目不存在，D-021 健康巡检用）。
     */
    @Select("SELECT COUNT(*) FROM t_memory_bank_relation r " +
            "WHERE r.tenant_id = #{tenantId} " +
            "AND (NOT EXISTS (SELECT 1 FROM t_memory_bank_entry e WHERE e.id = r.source_entry_id AND e.delete_flag = 0) " +
            "OR NOT EXISTS (SELECT 1 FROM t_memory_bank_entry e WHERE e.id = r.target_entry_id AND e.delete_flag = 0))")
    long countOrphanRelations(@Param("tenantId") Long tenantId);
}
