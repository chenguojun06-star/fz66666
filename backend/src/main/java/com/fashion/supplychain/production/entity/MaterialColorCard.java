package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 物料色卡母卡 - 以供应商为维度组织物料资料
 * 一张母卡 = 一家供应商 + 其下的多条物料资料
 */
@Data
@TableName("t_material_color_card")
public class MaterialColorCard {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String cardCode;

    private String cardName;

    private String supplierId;

    private String supplierName;

    private String supplierContactPerson;

    private String supplierContactPhone;

    private String materialType;

    private String fabricWidth;

    private String specifications;

    private String fabricWeight;

    private String fabricComposition;

    private String unit;

    private String coverImage;

    private String remark;

    private String status;

    private Integer materialCount;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
