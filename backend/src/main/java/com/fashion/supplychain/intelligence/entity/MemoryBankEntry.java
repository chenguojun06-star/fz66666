package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Memory Bank 记忆条目实体（ConPort 模式）。
 *
 * <p>替代 memory-bank/*.md 纯 Markdown 文件，支持语义检索和知识图谱关系。
 * category 区分 5 类：product_context/active_context/system_patterns/decision_log/progress。
 *
 * <p>多租户隔离：所有查询带 tenant_id（P0 铁律），tenant_id=0 表示公共记忆。
 */
@Data
@TableName("t_memory_bank_entry")
public class MemoryBankEntry {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    private Long tenantId;

    private String category;

    private String entryKey;

    private String title;

    private String content;

    /** 向量嵌入 JSON（未来接 Qdrant，当前为空） */
    private String contentVector;

    /** 标签数组 JSON（如 ["P0","socat","部署"]） */
    private String tags;

    /** 元数据 JSON（如 priority/status/related_keys） */
    private String metadata;

    @TableField(fill = com.baomidou.mybatisplus.annotation.FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = com.baomidou.mybatisplus.annotation.FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    @TableLogic
    @TableField("delete_flag")
    private Integer deleteFlag;
}
