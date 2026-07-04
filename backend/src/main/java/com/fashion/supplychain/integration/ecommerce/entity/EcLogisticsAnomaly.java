package com.fashion.supplychain.integration.ecommerce.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * Phase 3 物流异常预警实体
 * 对应 t_ec_logistics_anomaly 表。
 * 由 EcLogisticsAnomalyOrchestrator 扫描在途订单生成，AI 给出处理建议。
 */
@Data
@TableName("t_ec_logistics_anomaly")
public class EcLogisticsAnomaly {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long orderId;
    private String orderNo;
    private String trackingNo;
    private String expressCompany;
    private String receiverName;
    private String receiverPhone;

    /** 异常类型：DELAY/STALE/EXCEPTION/SIGNED_ABNORMAL/RETURN_RISK */
    private String anomalyType;

    /** 严重度：HIGH/MEDIUM/LOW */
    private String severity;

    /** 距离最后轨迹更新天数 */
    private Integer daysSinceUpdate;

    private String lastTrackDesc;
    private LocalDateTime lastTrackTime;

    /** AI 处理建议 */
    private String aiAdvice;

    /** AI 置信度 0-100 */
    private Integer aiConfidence;

    /** 0未处理/1已处理/2已忽略 */
    private Integer handledStatus;

    private String handledBy;
    private LocalDateTime handledTime;
    private String handledRemark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
