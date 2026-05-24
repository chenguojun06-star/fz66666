package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_urge_record")
public class UrgeRecord {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    private Long tenantId;

    private String orderId;

    private String orderNo;

    private String senderName;

    private String receiverName;

    private String remark;

    private String status;

    private String replyContent;

    private LocalDateTime replyExpectedShipDate;

    private LocalDateTime replyTime;

    private LocalDateTime createdAt;
}
