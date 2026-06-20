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

    /** metadata 层（~50 tokens，name/description/triggers，YAML 格式） */
    private String metadataYaml;

    /** SKILL.md 层（~500 tokens，完整技能文档，Markdown 格式） */
    private String skillMd;

    /** references 层（按需加载的详细参考，JSON 数组） */
    private String referencesJson;

    /** metadata 层 token 预算（默认 50） */
    private Integer tokenBudgetMetadata;

    /** SKILL.md 层 token 预算（默认 500） */
    private Integer tokenBudgetSkillMd;

    /** 披露级别：MINIMAL/STANDARD/FULL */
    private String disclosureLevel;

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
