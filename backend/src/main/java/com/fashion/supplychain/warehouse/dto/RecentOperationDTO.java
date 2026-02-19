package com.fashion.supplychain.warehouse.dto;

import lombok.Data;

/**
 * 最近操作记录DTO
 */
@Data
public class RecentOperationDTO {
    /**
     * ID
     */
    private String id;

    /**
     * 操作类型: inbound(入库), outbound(出库)
     */
    private String type;

    /**
     * 物料名称
     */
    private String materialName;

    /**
     * 数量
     */
    private Integer quantity;

    /**
     * 操作人
     */
    private String operator;

    /**
     * 操作时间（HH:mm格式）
     */
    private String time;
}
