package com.fashion.supplychain.style.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
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
    private String currency;
    
    /**
     * 版本号
     */
    private String version;
}
