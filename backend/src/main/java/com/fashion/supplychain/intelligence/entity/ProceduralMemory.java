package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * L4 程序性记忆实体 - SOP/流程/技能
 */
@Data
@TableName("t_procedural_memory")
public class ProceduralMemory {

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("tenant_id")
    private Long tenantId;

    @TableField("sop_name")
    private String sopName;

    @TableField("sop_type")
    private String sopType;

    @TableField("steps_json")
    private String stepsJson;

    @TableField("preconditions")
    private String preconditions;

    @TableField("postcheck")
    private String postcheck;

    @TableField("trigger_keywords")
    private String triggerKeywords;

    @TableField("confidence")
    private Double confidence;

    @TableField("usage_count")
    private Integer usageCount;

    @TableField("success_count")
    private Integer successCount;

    @TableField("version")
    private Integer version;

    @TableField("source")
    private String source;

    @TableField("enabled")
    private Integer enabled;

    @TableField("delete_flag")
    private Integer deleteFlag;

    @TableField("create_time")
    private LocalDateTime createTime;

    @TableField("update_time")
    private LocalDateTime updateTime;
}
