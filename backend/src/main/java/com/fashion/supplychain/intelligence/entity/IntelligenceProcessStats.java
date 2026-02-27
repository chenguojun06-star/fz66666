package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 工序耗时统计实体 — 智能预判学习数据
 *
 * <p>每日由 IntelligenceLearningJob 从 t_scan_record 聚合写入。
 * 样本越多 → confidence_score 越高 → 预测越准。
 */
@Data
@TableName("t_intelligence_process_stats")
public class IntelligenceProcessStats {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 租户ID（多租户隔离，学习数据不互串） */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 工序阶段名称，对应 t_scan_record.progress_stage */
    private String stageName;

    /** 扫码类型：production / quality / warehouse */
    private String scanType;

    /** 样本量（参与统计的有效订单数），驱动置信度增长 */
    private Integer sampleCount;

    /** 每件平均耗时（分钟）：用于 剩余件数 × avg = 预计剩余分钟 */
    private BigDecimal avgMinutesPerUnit;

    /** 每件最短耗时（分钟） */
    private BigDecimal minMinutesPerUnit;

    /** 每件最长耗时（分钟） */
    private BigDecimal maxMinutesPerUnit;

    /**
     * 该阶段整体平均耗时（分钟）
     * 用于"只知道进度百分比"时的快速预测：
     *   remaining_minutes = avgStageTotalMinutes × (100 - currentProgress) / 100
     */
    private BigDecimal avgStageTotalMinutes;

    /**
     * 置信度 [0, 1]
     * 公式：min(0.92, 0.35 + ln(sampleCount + 1) × 0.12)
     * 2样本→0.44，10样本→0.64，50样本→0.82，100样本→0.90
     */
    private BigDecimal confidenceScore;

    /** 最后一次由学习Job计算的时间 */
    private LocalDateTime lastComputedTime;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
