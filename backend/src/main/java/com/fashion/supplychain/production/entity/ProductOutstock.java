package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_product_outstock")
public class ProductOutstock {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String outstockNo;

    private String orderId;

    private String orderNo;

    private String styleId;

    private String styleNo;

    private String styleName;

    private Integer outstockQuantity;

    private String outstockType;

    private String warehouse;

    private String remark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;

    // ==================== 操作人字段（自动填充）====================

    @TableField(fill = FieldFill.INSERT)
    private String operatorId;

    @TableField(fill = FieldFill.INSERT)
    private String operatorName;

    @TableField(fill = FieldFill.INSERT)
    private String creatorId;

    @TableField(fill = FieldFill.INSERT)
    private String creatorName;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
