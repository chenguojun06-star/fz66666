package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Data;

/** 跨租户匿名基准快照 — 每日计算，用于行业对标 */
@Data
@TableName("t_benchmark_snapshot")
public class BenchmarkSnapshot {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private LocalDate snapshotDate;

    /** 逾期率(%) */
    private BigDecimal overdueRate;

    /** 平均完成率(%) */
    private BigDecimal avgCompletionRate;

    /** 准时交货率(%) */
    private BigDecimal onTimeDeliveryRate;

    /** 次品率(%) */
    private BigDecimal defectRate;

    /** 综合效率分 0-100 */
    private BigDecimal efficiencyScore;

    /** 行业百分位排名（越高越好，100=最优） */
    private Integer percentileRank;

    /** 参与对标的租户总数 */
    private Integer peerCount;

    /** 行业中位效率分 */
    private BigDecimal industryMedian;

    private LocalDateTime createTime;
}
