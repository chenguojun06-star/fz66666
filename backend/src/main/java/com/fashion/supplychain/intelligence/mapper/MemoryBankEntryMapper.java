package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.MemoryBankEntry;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * Memory Bank 记忆条目 Mapper。
 *
 * <p>多租户隔离：所有自定义查询带 tenant_id WHERE（P0 铁律）。
 */
public interface MemoryBankEntryMapper extends BaseMapper<MemoryBankEntry> {

    /**
     * 按 category + entryKey 精确查询（多租户隔离）。
     */
    @Select("SELECT * FROM t_memory_bank_entry " +
            "WHERE tenant_id = #{tenantId} AND category = #{category} " +
            "AND entry_key = #{entryKey} AND delete_flag = 0 LIMIT 1")
    MemoryBankEntry selectByCategoryAndKey(@Param("tenantId") Long tenantId,
                                            @Param("category") String category,
                                            @Param("entryKey") String entryKey);

    /**
     * 全文搜索（LIKE，未来接 Qdrant 向量搜索）。
     * 搜索 title + content + tags，按 update_time 降序。
     */
    @Select("SELECT * FROM t_memory_bank_entry " +
            "WHERE tenant_id = #{tenantId} AND delete_flag = 0 " +
            "AND (title LIKE CONCAT('%',#{keyword},'%') " +
            "OR content LIKE CONCAT('%',#{keyword},'%') " +
            "OR tags LIKE CONCAT('%',#{keyword},'%')) " +
            "ORDER BY update_time DESC LIMIT #{limit}")
    List<MemoryBankEntry> searchByContent(@Param("tenantId") Long tenantId,
                                           @Param("keyword") String keyword,
                                           @Param("limit") int limit);

    /**
     * 按分类列出条目（按 update_time 降序）。
     */
    @Select("SELECT * FROM t_memory_bank_entry " +
            "WHERE tenant_id = #{tenantId} AND category = #{category} " +
            "AND delete_flag = 0 ORDER BY update_time DESC LIMIT #{limit}")
    List<MemoryBankEntry> listByCategory(@Param("tenantId") Long tenantId,
                                          @Param("category") String category,
                                          @Param("limit") int limit);

    /**
     * 统计租户条目数（D-021 统一可观测用）。
     */
    @Select("SELECT COUNT(*) FROM t_memory_bank_entry " +
            "WHERE tenant_id = #{tenantId} AND delete_flag = 0")
    long countByTenant(@Param("tenantId") Long tenantId);
}
