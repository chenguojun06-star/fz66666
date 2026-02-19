package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 面辅料库存实体
 */
@Data
@TableName("t_material_stock")
public class MaterialStock {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String materialId;

    private String materialCode;

    private String materialName;

    private String materialType;

    private String specifications;

    private String unit;

    /**
     * 颜色 (如: 红色, 黑色)
     */
    private String color;

    /**
     * 尺码 (如: 5号, 30cm)
     */
    private String size;

    /**
     * 供应商名称 (可选，若需按供应商区分库存)（旧字段，兼容保留）
     */
    private String supplierName;

    /**
     * 供应商ID（关联t_factory表，可选）
     */
    private String supplierId;

    /**
     * 供应商联系人
     */
    private String supplierContactPerson;

    /**
     * 供应商联系电话
     */
    private String supplierContactPhone;

    /**
     * 面料属性 - 幅宽 (仅面料，如: 150cm)
     */
    private String fabricWidth;

    /**
     * 面料属性 - 克重 (仅面料，如: 200g/m²)
     */
    private String fabricWeight;

    /**
     * 面料属性 - 成分 (仅面料，如: 100%棉)
     */
    private String fabricComposition;

    /**
     * 当前库存数量
     */
    private Integer quantity;

    /**
     * 占用/冻结数量 (用于生产预扣)
     */
    private Integer lockedQuantity;

    /**
     * 存放位置
     */
    private String location;

    /**
     * 单价（元）
     */
    private java.math.BigDecimal unitPrice;

    /**
     * 库存总值（元）= quantity * unitPrice
     */
    private java.math.BigDecimal totalValue;

    /**
     * 最后入库日期
     */
    private LocalDateTime lastInboundDate;

    /**
     * 最后出库日期
     */
    private LocalDateTime lastOutboundDate;

    /**
     * 安全库存 (默认100)
     */
    private Integer safetyStock;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;

    /**
     * 乐观锁版本号（并发库存操作防覆盖）
     */
    @Version
    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
