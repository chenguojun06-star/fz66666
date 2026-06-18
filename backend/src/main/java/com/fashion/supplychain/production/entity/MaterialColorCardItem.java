package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 物料色卡子条目 - 具体的物料资料
 */
@Data
@TableName("t_material_color_card_item")
public class MaterialColorCardItem {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String materialColorCardId;

    private String materialId;

    private String materialCode;

    private String materialName;

    private String materialType;

    private String color;

    private String fabricWidth;

    private String fabricWeight;

    private String fabricComposition;

    private String specifications;

    private String unit;

    private BigDecimal unitPrice;

    private String image;

    private String remark;

    private Integer sortOrder;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
