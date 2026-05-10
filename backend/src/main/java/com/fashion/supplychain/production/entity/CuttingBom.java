package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_cutting_bom")
public class CuttingBom {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String cuttingTaskId;

    private String productionOrderNo;

    private String styleNo;

    private String materialCode;

    private String materialName;

    private String materialType;

    private String fabricComposition;

    private String fabricWeight;

    private String color;

    private String size;

    private String specification;

    private String unit;

    private BigDecimal usageAmount;

    private BigDecimal lossRate;

    private BigDecimal unitPrice;

    private BigDecimal totalPrice;

    private String supplierId;

    private String supplierName;

    private String supplierContactPerson;

    private String supplierContactPhone;

    private String materialId;

    private String imageUrls;

    private String remark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
