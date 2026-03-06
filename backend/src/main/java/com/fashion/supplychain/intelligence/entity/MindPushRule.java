package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_mind_push_rule")
public class MindPushRule {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** DELIVERY_RISK / STAGNANT / MATERIAL_LOW / PAYROLL_READY */
    private String ruleCode;

    private String ruleName;

    /** 1=启用 0=禁用 */
    private Integer enabled;

    /** 触发天数阈值 */
    private Integer thresholdDays;

    /** 触发进度阈值（%） */
    private Integer thresholdProgress;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
