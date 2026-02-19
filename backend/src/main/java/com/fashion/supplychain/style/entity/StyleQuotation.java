package com.fashion.supplychain.style.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 款号报价单实体类
 */
@Data
@TableName("t_style_quotation")
public class StyleQuotation {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /**
     * 关联款号ID
     */
    private Long styleId;

    /**
     * 物料总成本
     */
    private BigDecimal materialCost;

    /**
     * 工序总成本
     */
    private BigDecimal processCost;

    /**
     * 其它费用(包装/运输等)
     */
    private BigDecimal otherCost;

    /**
     * 目标利润率(%)
     */
    private BigDecimal profitRate;

    /**
     * 总成本
     */
    private BigDecimal totalCost;

    /**
     * 报价
     */
    @TableField("total_price")
    private BigDecimal totalPrice;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;

    /**
     * 币种
     */
    @TableField(exist = false)
    private String currency;

    /**
     * 版本号
     */
    @TableField(exist = false)
    private String version;

    /**
     * 是否锁定（0=未锁定，1=已锁定）
     */
    private Integer isLocked;

    // ==================== 操作人字段（自动填充）====================

    @TableField(fill = FieldFill.INSERT)
    private String creatorId;

    @TableField(fill = FieldFill.INSERT)
    private String creatorName;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updaterId;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updaterName;

    private String auditorId;

    private String auditorName;

    private LocalDateTime auditTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
