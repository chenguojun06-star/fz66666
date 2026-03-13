package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/** 智能预测引擎日志 — 成本 / 需求 / 物料用量三维预测记录 */
@Data
@TableName("t_forecast_log")
public class ForecastLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** COST / DEMAND / MATERIAL */
    private String forecastType;

    /** 关联对象ID（订单ID / 款式ID / 物料编码） */
    private String subjectId;

    /** ORDER / STYLE / MATERIAL */
    private String subjectType;

    /** 预测值（金额元 / 件数 / 用量克/米） */
    private BigDecimal predictedValue;

    /** 置信度 0-100 */
    private Integer confidence;

    /** 预测地平线标签：本单 / 下月 / 下季 */
    private String horizonLabel;

    /** 算法标识：WMA / SEASONAL / BOM_RATIO */
    private String algorithm;

    /** 额外JSON数据（区间、明细、偏差等） */
    private String extraData;

    private LocalDateTime createTime;
}
