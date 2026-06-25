package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * L4程序性记忆：SOP/流程/技能
 *
 * <p>用途：将SOP从"知识库检索"升级为"直接调用"，流程类问题准确率→95%+</p>
 *
 * <p>来源：参考 five-layer-memory-design.md (D-022)</p>
 *
 * @author xiaoyun
 * @since 2026-06-24
 */
@Data
@TableName("t_procedural_memory")
public class ProceduralMemory {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（P0铁律4：多租户隔离） */
    private Long tenantId;

    /** SOP名称 */
    private String sopName;

    /** SOP类型：SCAN_WORKFLOW/WAGE_SETTLEMENT/DELIVERY_FORECAST/SUPPLIER_EVAL/QUALITY_CHECK */
    private String sopType;

    /** 步骤数组JSON：[{step,action,tool,expected}] */
    private String stepsJson;

    /** 前置条件JSON */
    private String preconditions;

    /** 后置校验JSON */
    private String postcheck;

    /** 触发关键词，逗号分隔 */
    private String triggerKeywords;

    /** 置信度0-100 */
    private BigDecimal confidence;

    /** 调用次数 */
    private Integer usageCount;

    /** 成功次数 */
    private Integer successCount;

    /** 版本号 */
    private Integer version;

    /** 来源：manual/crystallized */
    private String source;

    /** 是否启用 */
    private Integer enabled;

    /** 软删除标记 */
    private Integer deleteFlag;

    /** 创建时间 */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /** 更新时间 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    // ══════════════════════════════════════════════════════════════════════════
    // SOP类型枚举
    // ══════════════════════════════════════════════════════════════════════════

    public static final String SOP_TYPE_SCAN_WORKFLOW = "SCAN_WORKFLOW";
    public static final String SOP_TYPE_WAGE_SETTLEMENT = "WAGE_SETTLEMENT";
    public static final String SOP_TYPE_DELIVERY_FORECAST = "DELIVERY_FORECAST";
    public static final String SOP_TYPE_SUPPLIER_EVAL = "SUPPLIER_EVAL";
    public static final String SOP_TYPE_QUALITY_CHECK = "QUALITY_CHECK";

    public static final String SOURCE_MANUAL = "manual";
    public static final String SOURCE_CRYSTALLIZED = "crystallized";
}
