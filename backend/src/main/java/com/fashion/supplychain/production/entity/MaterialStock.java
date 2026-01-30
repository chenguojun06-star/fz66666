package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
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
     * 供应商名称 (可选，若需按供应商区分库存)
     */
    private String supplierName;

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
     * 安全库存 (默认100)
     */
    private Integer safetyStock;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;
}
