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

    private String factoryName;

    private String factoryType;

    private String orgUnitId;

    private String parentOrgUnitId;

    private String parentOrgUnitName;

    private String orgPath;

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
     * 最后一次入库的数量（来自最新 t_product_warehousing 记录的 qualified_quantity）
     * 注意：区别于 totalInboundQty（历史累计入库总量）
     */
    private Integer lastInboundQty;

    /**
     * 最后出库日期
     */
    private LocalDateTime lastOutboundDate;

    /**
     * 最后出库单号
     */
    private String lastOutstockNo;

    /**
     * 最后出库操作人
     */
    private String lastOutboundBy;

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

    /**
     * 成本价（来源：t_product_sku.cost_price）
     */
    private java.math.BigDecimal costPrice;

    /**
     * 销售价（来源：t_product_sku.sales_price）
     */
    private java.math.BigDecimal salesPrice;
}
