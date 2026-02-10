package com.fashion.supplychain.warehouse.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 成品库存DTO
 * 用于前端成品库存管理页面展示
 */
@Data
public class FinishedInventoryDTO {

    /**
     * 唯一标识（款号-颜色-尺码）
     */
    private String id;

    /**
     * 订单ID（必须，用于出库）
     */
    private String orderId;

    /**
     * 订单号
     */
    private String orderNo;

    /**
     * 款式ID（必须，用于出库）
     */
    private String styleId;

    /**
     * 款号
     */
    private String styleNo;

    /**
     * 款式名称
     */
    private String styleName;

    /**
     * 款式图片
     */
    private String styleImage;

    /**
     * 颜色
     */
    private String color;

    /**
     * 尺码
     */
    private String size;

    /**
     * SKU编码
     */
    private String sku;

    /**
     * 可用库存数量
     */
    private Integer availableQty;

    /**
     * 锁定库存数量
     */
    private Integer lockedQty;

    /**
     * 次品数量
     */
    private Integer defectQty;

    /**
     * 仓库位置
     */
    private String warehouseLocation;

    /**
     * 最后入库日期
     */
    private LocalDateTime lastInboundDate;

    /**
     * 质检入库号
     */
    private String qualityInspectionNo;

    /**
     * 最后入库操作人
     */
    private String lastInboundBy;

    /**
     * 该款式的所有颜色列表
     */
    private List<String> colors;

    /**
     * 该款式的所有尺码列表
     */
    private List<String> sizes;

    /**
     * 累计入库总数量
     */
    private Integer totalInboundQty;
}
