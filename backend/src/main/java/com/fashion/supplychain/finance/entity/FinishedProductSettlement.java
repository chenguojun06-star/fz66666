package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 成品结算汇总实体
 * 对应视图 v_finished_product_settlement
 */
@Data
@TableName("v_finished_product_settlement")
public class FinishedProductSettlement implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 订单ID（主键）
     */
    @TableId(type = IdType.INPUT)
    private String orderId;

    /**
     * 订单号
     */
    private String orderNo;

    /**
     * 订单状态
     */
    private String status;

    /**
     * 工厂ID
     */
    private String factoryId;

    /**
     * 工厂名称
     */
    private String factoryName;

    /**
     * 款号
     */
    private String styleNo;

    /**
     * 下单数量
     */
    private Integer orderQuantity;

    /**
     * 销售单价（含利润率）= t_style_quotation.total_price
     * 优先取报价单中含利润率的报价，无报价时回退到 t_style_info.price
     */
    private BigDecimal styleFinalPrice;

    /**
     * 目标利润率(%)，来自报价单设定值
     */
    private BigDecimal targetProfitRate;

    /**
     * 入库数量（合格品）
     */
    private Integer warehousedQuantity;

    /**
     * 次品数量
     */
    private Integer defectQuantity;

    /**
     * 颜色（多个用逗号分隔）
     */
    private String colors;

    /**
     * 面辅料总采购价
     */
    private BigDecimal materialCost;

    /**
     * 生产成本
     */
    private BigDecimal productionCost;

    /**
     * 次品报废金额
     */
    private BigDecimal defectLoss;

    /**
     * 总金额 = 款式最终价格 × 入库数
     */
    private BigDecimal totalAmount;

    /**
     * 利润 = 总金额 - 面辅料成本 - 生产成本 - 次品报废
     */
    private BigDecimal profit;

    /**
     * 利润率 (%)
     */
    private BigDecimal profitMargin;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
