package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_cutting_bundle")
public class CuttingBundle {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String productionOrderId;

    private String productionOrderNo;

    private String styleId;

    private String styleNo;

    private String color;

    private String size;

    private Integer bundleNo;

    private Integer quantity;

    private String qrCode;

    private String status;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}

