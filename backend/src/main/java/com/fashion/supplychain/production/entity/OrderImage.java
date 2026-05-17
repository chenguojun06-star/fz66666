package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_order_image")
public class OrderImage {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String orderId;
    private String orderNo;
    private String imageUrl;
    private String thumbnailUrl;
    private Integer sortOrder;
    private Integer version;
    private String operatorId;
    private String operatorName;
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private Integer deleteFlag;
}
