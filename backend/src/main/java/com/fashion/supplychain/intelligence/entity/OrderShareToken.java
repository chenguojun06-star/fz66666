package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_order_share_token")
public class OrderShareToken {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String orderId;
    private String orderNo;
    private String token;
    private Integer expireDays;
    private LocalDateTime expiresAt;
    private Integer accessCount;
    private String createdBy;
    private LocalDateTime createdAt;
}
