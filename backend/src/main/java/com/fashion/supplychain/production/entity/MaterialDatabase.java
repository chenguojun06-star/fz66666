package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_material_database")
public class MaterialDatabase {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String materialCode;

    private String materialName;

    private String styleNo;

    private String materialType;

    private String color;

    private String fabricWidth;

    private String fabricWeight;

    private String fabricComposition;

    private String specifications;

    private String unit;

    /**
     * 供应商ID（关联 t_factory）
     */
    private String supplierId;

    private String supplierName;

    /**
     * 供应商联系人
     */
    private String supplierContactPerson;

    /**
     * 供应商联系电话
     */
    private String supplierContactPhone;

    private BigDecimal unitPrice;

    /**
     * 米重换算值（米/公斤，参考值）
     */
    private BigDecimal conversionRate;

    private String description;

    private String image;

    private String remark;

    private String status;

    private LocalDateTime completedTime;

    private String returnReason;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;

    private Integer disabled;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private Integer isColorCard;

    private String sourceColorCardId;

    /**
     * 关联辅料ID数组JSON（如 ["uuid1","uuid2"]）
     * D-P2-6：用于 BOM 选主面料时自动带出辅料，避免漏采购
     * 前端调 GET /api/material/database/{id}/companions 拉取关联辅料列表
     */
    private String companionMaterialIds;
}
