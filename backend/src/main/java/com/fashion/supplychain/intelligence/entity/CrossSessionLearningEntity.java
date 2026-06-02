package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_cross_session_learning")
public class CrossSessionLearningEntity {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("tenant_id")
    private Long tenantId;

    @TableField("user_id")
    private String userId;

    @TableField("learning_key")
    private String learningKey;

    @TableField("learning_value")
    private String learningValue;

    @TableField("learning_type")
    private String learningType;

    @TableField("source_session_id")
    private String sourceSessionId;

    @TableField("confidence")
    private Double confidence;

    @TableField("hit_count")
    private Integer hitCount;

    @TableField("last_used_at")
    private LocalDateTime lastUsedAt;

    @TableField("status")
    private String status;

    @TableLogic
    @TableField("delete_flag")
    private Integer deleteFlag;

    @TableField("create_time")
    private LocalDateTime createTime;

    @TableField("update_time")
    private LocalDateTime updateTime;
}
