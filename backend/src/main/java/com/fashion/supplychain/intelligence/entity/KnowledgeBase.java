package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * AI知识库实体 — RAG问答Skill数据源
 */
@Data
@TableName("t_knowledge_base")
public class KnowledgeBase {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 租户ID，NULL表示公共知识 */
    private Long tenantId;

    /** 分类：terminology=行业术语, system_guide=系统指南, faq=常见问题, sop=操作规程, rule=业务规则 */
    private String category;

    /** 知识条目标题 */
    private String title;

    /** 知识内容（完整解释） */
    private String content;

    /** 关键词（逗号分隔，用于检索） */
    private String keywords;

    /** 来源说明 */
    private String source;

    /** 浏览次数 */
    private Integer viewCount;

    /** 有帮助次数 */
    private Integer helpfulCount;

    /** 删除标记 0=正常 1=已删除 */
    private Integer deleteFlag;

    @TableField("created_at")
    private LocalDateTime createTime;

    @TableField("updated_at")
    private LocalDateTime updateTime;
}
