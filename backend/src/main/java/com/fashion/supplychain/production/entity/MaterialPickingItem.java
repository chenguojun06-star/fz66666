package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_material_picking_item")
public class MaterialPickingItem {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private String pickingId;
    private String materialStockId;
    private String materialId;
    private String materialCode;
    private String materialName;
    private String color;
    private String size;
    /** 领料数量（D-414：INT → DECIMAL(12,4)，支持面料按米/码的小数领料） */
    private BigDecimal quantity;
    private String unit;
    private String specification;
    private BigDecimal unitPrice;
    private String fabricWidth;
    private String fabricComposition;
    private String supplierName;
    private String warehouseLocation;
    private String materialType;
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
