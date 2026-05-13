package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_bargain_price")
public class BargainPrice {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String targetType;

    private String targetId;

    private String targetNo;

    private BigDecimal originalPrice;

    private BigDecimal bargainedPrice;

    private String reason;

    private String bargainedBy;

    private String bargainedByName;

    private String approvedBy;

    private String approvedByName;

    private String status;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}