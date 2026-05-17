package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_order_image_snapshot")
public class OrderImageSnapshot {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String orderNo;
    private String snapshotType;
    private String beforeUrls;
    private String afterUrls;
    private String operatorId;
    private String operatorName;
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
    private LocalDateTime createTime;
}
