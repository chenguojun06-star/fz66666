package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_intent_composition_template")
public class IntentCompositionTemplateEntity {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("tenant_id")
    private Long tenantId;

    @TableField("template_name")
    private String templateName;

    @TableField("trigger_pattern")
    private String triggerPattern;

    @TableField("intent_sequence")
    private String intentSequence;

    @TableField("composition_strategy")
    private String compositionStrategy;

    @TableField("priority")
    private Integer priority;

    @TableField("enabled")
    private Integer enabled;

    @TableField("hit_count")
    private Long hitCount;

    @TableField("last_hit_at")
    private LocalDateTime lastHitAt;

    @TableField("description")
    private String description;

    @TableLogic
    @TableField("delete_flag")
    private Integer deleteFlag;

    @TableField("create_time")
    private LocalDateTime createTime;

    @TableField("update_time")
    private LocalDateTime updateTime;
}
