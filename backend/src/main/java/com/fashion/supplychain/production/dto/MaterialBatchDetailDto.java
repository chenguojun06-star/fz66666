package com.fashion.supplychain.production.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 物料批次明细DTO
 * 用于出库时选择批次（FIFO先进先出）
 */
@Data
public class MaterialBatchDetailDto {

    /**
     * 批次号（使用入库单号）
     */
    private String batchNo;

    /**
     * 仓库位置
     */
    private String warehouseLocation;

    /**
     * 颜色
     */
    private String color;

    /**
     * 尺码/规格
     */
    private String size;

    /**
     * 可用库存数量
     */
    private Integer availableQty;

    /**
     * 锁定库存数量
     */
    private Integer lockedQty;

    /**
     * 入库日期
     */
    @JsonFormat(pattern = "yyyy-MM-dd", timezone = "GMT+8")
    private LocalDateTime inboundDate;

    /**
     * 过期日期（可选）
     */
    @JsonFormat(pattern = "yyyy-MM-dd", timezone = "GMT+8")
    private LocalDateTime expiryDate;

    /**
     * 已出库数量（累计）
     */
    private Integer outboundQty;
}
