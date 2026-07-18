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

    /**
     * 部位编码（引用 t_dict.dict_type=garment_part，如 GARMENT_PART_UPPER 表示上装）
     * 默认 GARMENT_PART_WHOLE（整件），套装/亲子装/拼接款按部位区分
     */
    private String partCode;

    /**
     * 部位名称（冗余字段，便于展示，如：上装、下装、马甲、里布）
     */
    private String partName;

    /**
     * 子部位名称（如：袖口、领子、门襟、下摆、口袋；为空表示主部位整件使用）
     * 与 part_code 配合形成两级部位，支持多面料拼接款精细化管理
     */
    private String subPartName;

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
