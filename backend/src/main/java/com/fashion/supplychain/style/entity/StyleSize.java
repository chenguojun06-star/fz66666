package com.fashion.supplychain.style.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 款号尺寸表实体类
 */
@Data
@TableName("t_style_size")
public class StyleSize {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /**
     * 关联款号ID
     */
    private Long styleId;

    /**
     * 尺码名称 (S, M, L, XL...)
     */
    private String sizeName;

    /**
     * 部位名称 (胸围, 衣长, 肩宽...)
     */
    private String partName;

    private String measureMethod;

    /**
     * 标准数值
     */
    private BigDecimal standardValue;

    /**
     * 公差 (+/-)
     */
    private BigDecimal tolerance;

    /**
     * 排序
     */
    private Integer sort;

    /**
     * 领取人
     */
    private String assignee;

    /**
     * 开始时间
     */
    private LocalDateTime startTime;

    /**
     * 完成时间
     */
    private LocalDateTime completedTime;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
