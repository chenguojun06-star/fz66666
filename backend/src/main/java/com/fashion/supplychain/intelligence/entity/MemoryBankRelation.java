package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Memory Bank 知识图谱关系实体（ConPort 模式）。
 *
 * <p>记录 decisions ↔ progress ↔ architecture 之间的显式关系，
 * 支持图谱遍历（CTE 递归查询）。
 *
 * <p>关系类型：
 * <ul>
 *   <li>IMPACTS — A 影响 B</li>
 *   <li>DEPENDS_ON — A 依赖 B</li>
 *   <li>EVOLVES_FROM — A 由 B 演化而来</li>
 *   <li>REFERENCES — A 引用 B</li>
 * </ul>
 */
@Data
@TableName("t_memory_bank_relation")
public class MemoryBankRelation {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    private Long tenantId;

    private String sourceEntryId;

    private String targetEntryId;

    private String relationType;

    private BigDecimal weight;

    @TableField(fill = com.baomidou.mybatisplus.annotation.FieldFill.INSERT)
    private LocalDateTime createTime;
}
