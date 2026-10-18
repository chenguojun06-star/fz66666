package com.fashion.supplychain.ticket;

/**
 * 电子小票来源单据类型常量。
 *
 * <p>每种「对客户卖货」的单据一张小票；写入 {@code t_sales_ticket.source_biz_type}，
 * 聚合层据此分支查源单据。
 */
public final class TicketTypes {

    /** POS 收银台销售单（t_pos_sale.id） */
    public static final String POS_SALE = "POS_SALE";

    /** C端店铺订单（t_shop_order.id，UUID） */
    public static final String SHOP_ORDER = "SHOP_ORDER";

    /** 批发销售出库单（t_product_outstock.id，UUID，仅 shipment 类销售出货） */
    public static final String OUTSTOCK = "OUTSTOCK";

    /** 签收状态 */
    public static final String STATUS_UNSIGNED = "UNSIGNED";
    public static final String STATUS_SIGNED = "SIGNED";
    public static final String STATUS_VOID = "VOID";

    private TicketTypes() {
    }
}
