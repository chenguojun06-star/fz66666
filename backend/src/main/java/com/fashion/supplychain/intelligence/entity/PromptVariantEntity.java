package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_prompt_variant")
public class PromptVariantEntity {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("tenant_id")
    private Long tenantId;

    @TableField("intent")
    private String intent;

    @TableField("variant_name")
    private String variantName;

    @TableField("content")
    private String content;

    @TableField("variant_type")
    private String variantType;

    @TableField("traffic_weight")
    private Integer trafficWeight;

    @TableField("status")
    private String status;

    @TableField("hit_count")
    private Long hitCount;

    @TableField("total_score")
    private Double totalScore;

    @TableField("avg_score")
    private Double avgScore;

    @TableField("last_evaluated_at")
    private LocalDateTime lastEvaluatedAt;

    @TableField("parent_variant_id")
    private Long parentVariantId;

    @TableField("evolve_round")
    private Integer evolveRound;

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
