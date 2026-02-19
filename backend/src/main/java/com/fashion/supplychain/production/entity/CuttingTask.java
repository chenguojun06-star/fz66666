package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_cutting_task")
public class CuttingTask {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String productionOrderId;

    private String productionOrderNo;

    private String orderQrCode;

    private String styleId;

    private String styleNo;

    private String styleName;

    private String color;

    private String size;

    private Integer orderQuantity;

    private String status;

    private String receiverId;

    private String receiverName;

    private LocalDateTime receivedTime;

    private LocalDateTime bundledTime;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private String remarks;

    private java.time.LocalDate expectedShipDate;

    @TableField(exist = false)
    private Integer cuttingQuantity;

    @TableField(exist = false)
    private Integer cuttingBundleCount;

    // ==================== 订单关联字段（非数据库字段）====================

    /**
     * 下单人姓名（来自关联的生产订单）
     */
    @TableField(exist = false)
    private String orderCreatorName;

    /**
     * 下单时间（来自关联的生产订单）
     */
    @TableField(exist = false)
    private LocalDateTime orderTime;

    // ==================== 操作人字段（自动填充）====================

    @TableField(fill = FieldFill.INSERT)
    private String creatorId;

    @TableField(fill = FieldFill.INSERT)
    private String creatorName;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updaterId;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updaterName;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
