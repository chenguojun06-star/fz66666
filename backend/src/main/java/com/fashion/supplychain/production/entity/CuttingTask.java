package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
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

    @TableField(exist = false)
    private Integer cuttingQuantity;

    @TableField(exist = false)
    private Integer cuttingBundleCount;
}
