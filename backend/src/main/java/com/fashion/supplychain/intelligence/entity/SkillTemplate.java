package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_skill_template")
public class SkillTemplate {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;
    private String skillName;
    private String skillGroup;
    private String title;
    private String description;
    private String triggerPhrases;
    private String stepsJson;
    private String preConditions;
    private String postCheck;
    private String source;
    private String sourceConversationId;
    private Integer version;
    private Integer useCount;
    private Integer successCount;
    private BigDecimal avgRating;
    private BigDecimal confidence;
    private Integer enabled;
    private Integer deleteFlag;

    @TableField("created_at")
    private LocalDateTime createTime;

    @TableField("updated_at")
    private LocalDateTime updateTime;
}
