package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.experimental.Accessors;

import java.time.LocalDateTime;

@Data
@Accessors(chain = true)
@TableName("t_intelligence_restock_suggestion")
public class RestockSuggestionItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long materialId;
    private String materialName;
    private String materialCode;
    private Double currentStock;
    private Double safetyStock;
    private Double avgDailyUsage;
    private Integer daysUntilShortage;
    private Double suggestedQuantity;
    private String priority;
    private String reason;
    private LocalDateTime createdAt;
}
