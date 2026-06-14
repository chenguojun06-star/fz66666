package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_intelligence_daily_briefing")
public class DailyBriefing {
    @TableId(type = IdType.AUTO)
    @TableField("id")
    private Long id;

    @TableField("tenant_id")
    private Long tenantId;

    @TableField("briefing_date")
    private LocalDate briefingDate;

    @TableField("total_orders")
    private Integer totalOrders;

    @TableField("pending_orders")
    private Integer pendingOrders;

    @TableField("at_risk_orders")
    private Integer atRiskOrders;

    @TableField("total_production_progress")
    private Double totalProductionProgress;

    @TableField("delayed_style_count")
    private Integer delayedStyleCount;

    @TableField("low_stock_items")
    private Integer lowStockItems;

    @TableField("wage_pending_amount")
    private BigDecimal wagePendingAmount;

    @TableField("summary")
    private String summary;

    @TableField("generated_at")
    private LocalDateTime generatedAt;
}
