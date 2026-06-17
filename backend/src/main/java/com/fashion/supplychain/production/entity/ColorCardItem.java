package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_color_card_item")
public class ColorCardItem {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String colorCardId;

    private String colorNo;

    private String colorName;

    private BigDecimal unitPrice;

    private String image;

    private String remark;

    private Integer sortOrder;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
