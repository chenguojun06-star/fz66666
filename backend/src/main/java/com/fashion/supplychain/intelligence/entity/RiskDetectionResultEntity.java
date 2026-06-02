package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_risk_detection_result")
public class RiskDetectionResultEntity {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("tenant_id")
    private Long tenantId;

    @TableField("risk_type")
    private String riskType;

    @TableField("target_type")
    private String targetType;

    @TableField("target_id")
    private String targetId;

    @TableField("target_name")
    private String targetName;

    @TableField("risk_level")
    private String riskLevel;

    @TableField("risk_score")
    private Integer riskScore;

    @TableField("risk_reason")
    private String riskReason;

    @TableField("recommended_action")
    private String recommendedAction;

    @TableField("status")
    private String status;

    @TableField("detector_name")
    private String detectorName;

    @TableField("confidence")
    private Double confidence;

    @TableField("related_data")
    private String relatedData;

    @TableField("detected_at")
    private LocalDateTime detectedAt;

    @TableField("resolved_at")
    private LocalDateTime resolvedAt;

    @TableLogic
    @TableField("delete_flag")
    private Integer deleteFlag;

    @TableField("create_time")
    private LocalDateTime createTime;

    @TableField("update_time")
    private LocalDateTime updateTime;
}
