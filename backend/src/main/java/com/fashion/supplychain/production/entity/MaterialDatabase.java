package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableId;
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

    private String specifications;

    private String unit;

    private String supplierName;

    private BigDecimal unitPrice;

    private String description;

    private String image;

    private String remark;

    private String status;

    private LocalDateTime completedTime;

    private String returnReason;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;
}
