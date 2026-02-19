package com.fashion.supplychain.warehouse.dto;

import lombok.Data;

/**
 * 趋势数据点DTO
 */
@Data
public class TrendDataPointDTO {
    /**
     * 日期/时间点（如"1日", "周一", "10:00", "1月"）
     */
    private String date;

    /**
     * 数值
     */
    private Integer value;

    /**
     * 类型: "入库" 或 "出库"
     */
    private String type;
}
