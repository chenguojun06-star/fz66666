package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 工序单价调整记录
 * 记录管理员对订单工序单价的手动调整，支持审计追踪。
 * 调整只影响当前订单下游结算，不回流工序模板。
 */
@Data
@TableName("t_process_price_adjustment")
public class ProcessPriceAdjustment {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private String orderId;
    private String orderNo;
    private String bundleId;
    private String bundleNo;
    private String processName;
    private String processCode;
    private String progressStage;
    private BigDecimal originalPrice;
    private BigDecimal adjustedPrice;
    private String reason;
    private String adjustedBy;
    private String adjustedByName;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime adjustedAt;

    private Integer deleteFlag;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
