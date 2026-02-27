package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 预测日志与反馈实体 — 闭环学习数据源
 *
 * <p>每次调用 /intelligence/predict/finish-time 时写入一条记录。
 * 用户通过 /intelligence/feedback 回填实际完成时间后，
 * deviation_minutes 自动计算并存储，供每日学习任务分析偏差、更新统计。
 */
@Data
@TableName("t_intelligence_prediction_log")
public class IntelligencePredictionLog {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;

    /** 预测唯一ID，返回前端，反馈时上传（UUID格式：PRED-xxx） */
    private String predictionId;

    private String orderId;
    private String orderNo;

    /** 工序阶段名称 */
    private String stageName;

    /** 子工序名（可为null，阶段级预测时不填） */
    private String processName;

    /** 预测时的进度百分比（0-100） */
    private Integer currentProgress;

    /** 模型给出的预测完成时间 */
    private LocalDateTime predictedFinishTime;

    /** 实际完成时间（用户反馈后回填；未反馈则为null） */
    private LocalDateTime actualFinishTime;

    /** 本次预测置信度 */
    private BigDecimal confidence;

    /**
     * 偏差分钟数 = TIMESTAMPDIFF(MINUTE, predictedFinishTime, actualFinishTime)
     * 正数=预测偏早，负数=预测偏晚；偏差绝对值越大说明模型越需要校正
     */
    private Long deviationMinutes;

    /** 用户是否采纳了AI建议（true=接受，false=拒绝，null=未反馈） */
    private Boolean feedbackAccepted;

    /** 预测时使用的样本量（快照，便于离线分析） */
    private Integer sampleCount;

    /** 算法版本标识（rule_v1=规则引擎 / ml_v1=机器学习模型） */
    private String algorithmVersion;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
