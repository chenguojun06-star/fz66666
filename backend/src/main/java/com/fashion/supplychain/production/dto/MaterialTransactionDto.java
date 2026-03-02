package com.fashion.supplychain.production.dto;

import lombok.Data;

/**
 * 面辅料出入库流水 DTO（出入库合并后的统一视图）
 */
@Data
public class MaterialTransactionDto {

    /** 类型：IN=入库，OUT=出库 */
    private String type;

    /** 显示用类型标签（入库/出库） */
    private String typeLabel;

    /** 操作时间（ISO格式） */
    private String operationTime;

    /** 数量 */
    private Integer quantity;

    /** 单位 */
    private String unit;

    /** 操作人姓名 */
    private String operatorName;

    /** 仓位 */
    private String warehouseLocation;

    /** 备注 */
    private String remark;
}
