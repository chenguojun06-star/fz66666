package com.fashion.supplychain.warehouse.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

/**
 * 出库分享页响应 DTO（公开接口，无需鉴权）
 * 仅包含可公开的字段，不暴露成本价、内部操作人等信息
 */
@Data
public class OutstockShareResponse {

    private String token;

    /** 客户名称 */
    private String customerName;

    /** 客户电话 */
    private String customerPhone;

    /** 收货地址 */
    private String shippingAddress;

    /** 租户公司名（品牌形象） */
    private String companyName;

    /** 分享码有效期（UTC 毫秒时间戳） */
    private Long expiresAt;

    /** 出库明细列表 */
    private List<OutstockItem> items;

    /** 合计数量 */
    private Integer totalQuantity;

    /** 合计金额 */
    private BigDecimal totalAmount;

    @Data
    public static class OutstockItem {
        private String outstockNo;
        private String orderNo;
        private String styleNo;
        private String styleName;
        private String color;
        private String size;
        private Integer outstockQuantity;
        private BigDecimal salesPrice;
        private BigDecimal totalAmount;
        private String trackingNo;
        private String expressCompany;
        private String outstockTime;
        private String paymentStatus;
    }
}
