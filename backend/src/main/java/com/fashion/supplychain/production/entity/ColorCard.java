package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_color_card")
public class ColorCard {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String colorCardCode;

    private String colorCardName;

    private String materialType;

    private String fabricWidth;

    private String specifications;

    private String fabricWeight;

    private String fabricComposition;

    private String unit;

    private String supplierId;

    private String supplierName;

    private String supplierContactPerson;

    private String supplierContactPhone;

    private String image;

    private String remark;

    private String status;

    private Integer colorCount;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private String materialId;
}
