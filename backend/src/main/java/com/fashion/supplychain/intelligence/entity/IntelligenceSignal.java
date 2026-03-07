package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_intelligence_signal")
public class IntelligenceSignal {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** anomaly / bottleneck / risk / shortage */
    private String signalType;

    /** 具体信号编码，如 output_spike / idle_worker */
    private String signalCode;

    /** critical / warning / info */
    private String signalLevel;

    /** 来源域 production / finance / warehouse */
    private String sourceDomain;

    /** 关联业务ID（订单ID、工人ID等） */
    private String sourceId;

    private String sourceName;

    private String signalTitle;

    /** 原始信号数据（JSON文本） */
    private String signalDetail;

    /** AI生成的类人化分析：为什么发现/可能影响什么/建议先做什么 */
    private String signalAnalysis;

    /** 关联信号IDs，逗号分隔 */
    private String relatedIds;

    /** 优先级评分 0-100，critical=90+, warning=60+ */
    private Integer priorityScore;

    /** open / handling / resolved */
    private String status;

    private LocalDateTime resolvedAt;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;
}
