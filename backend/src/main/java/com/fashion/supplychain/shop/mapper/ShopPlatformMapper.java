package com.fashion.supplychain.shop.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 平台级电商跨租户只读查询（P0）。
 *
 * <p><b>为什么单独一个 Mapper：</b>平台商品池要「一次查出所有租户已上架的款式」，
 * 而 {@code t_style_info} / {@code t_product_sku} / {@code t_shop_order} 都带 tenant_id，
 * 会被 {@code TenantInterceptor} 自动追加 {@code AND tenant_id = 当前租户}（平台超管
 * 登录时还会退化成 {@code tenant_id IS NULL} → 0 行）。
 * 因此本 Mapper 类级标注 {@code @InterceptorIgnore(tenantLine = "true")} 显式绕过，
 * 与 {@code IntelligenceProcessStatsMapper} 的跨租户查询同一做法。
 *
 * <p><b>安全性：</b>本 Mapper 只提供 SELECT，且只查「已上架」或聚合计数，
 * 不含成本/供应商等内部字段；写入侧一律走各租户自己的既有编排器（带租户上下文）。
 *
 * <p><b>为什么返回 Map：</b>平台首页/商品池是展示型只读数据，字段随页面演进频繁变化，
 * 用 Map + SQL 别名（{@code AS styleId}）避免为一次性视图新增大量 DTO。
 */
@Mapper
@InterceptorIgnore(tenantLine = "true")
public interface ShopPlatformMapper {

    /** 平台商品池：已上架款式总数（跨租户） */
    @Select("<script>"
            + "SELECT COUNT(*) FROM t_style_info s WHERE s.shop_listed = 1 "
            + "<if test='keyword != null'> AND (s.style_name LIKE CONCAT('%', #{keyword}, '%') "
            + "  OR s.style_no LIKE CONCAT('%', #{keyword}, '%')) </if>"
            + "<if test='category != null'> AND s.category = #{category} </if>"
            + "</script>")
    long countListedStyles(@Param("keyword") String keyword, @Param("category") String category);

    /**
     * 平台商品池：分页查已上架款式（带所属店铺 slug / 店名，供前端「进店」跳转）。
     * 店铺配置缺失（未建店）时 LEFT JOIN 给出 null，由调用方回填 slug 兜底。
     */
    @Select("<script>"
            + "SELECT s.id AS styleId, s.tenant_id AS tenantId, s.style_no AS styleNo, "
            + "       s.style_name AS styleName, s.category AS category, s.cover AS cover, "
            + "       s.shop_listing_time AS shopListingTime, "
            + "       c.slug AS slug, c.shop_name AS shopName "
            + "FROM t_style_info s "
            + "LEFT JOIN t_shop_config c ON c.tenant_id = s.tenant_id "
            + "WHERE s.shop_listed = 1 "
            + "<if test='keyword != null'> AND (s.style_name LIKE CONCAT('%', #{keyword}, '%') "
            + "  OR s.style_no LIKE CONCAT('%', #{keyword}, '%')) </if>"
            + "<if test='category != null'> AND s.category = #{category} </if>"
            + "ORDER BY s.shop_listing_time DESC, s.id DESC "
            + "LIMIT #{offset}, #{size}"
            + "</script>")
    List<Map<String, Object>> pageListedStyles(@Param("keyword") String keyword,
                                               @Param("category") String category,
                                               @Param("offset") int offset,
                                               @Param("size") int size);

    /** 指定款式的全部 SKU（跨租户，用于商品池卡片算「最低价 / 总可售 / 颜色数」） */
    @Select("<script>"
            + "SELECT style_id AS styleId, color AS color, sales_price AS salesPrice, "
            + "       stock_quantity AS stockQuantity "
            + "FROM t_product_sku WHERE style_id IN "
            + "<foreach collection='styleIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>"
            + "</script>")
    List<Map<String, Object>> listSkusByStyleIds(@Param("styleIds") List<Long> styleIds);

    /** 平台店铺列表（营业中在前），带已上架商品数 */
    @Select("SELECT c.tenant_id AS tenantId, c.slug AS slug, c.shop_name AS shopName, "
            + "       c.notice AS notice, c.enabled AS enabled, "
            + "       (SELECT COUNT(*) FROM t_style_info s "
            + "         WHERE s.tenant_id = c.tenant_id AND s.shop_listed = 1) AS productCount "
            + "FROM t_shop_config c "
            + "ORDER BY c.enabled DESC, c.shop_name ASC")
    List<Map<String, Object>> listShops();

    /** 平台商品池类目聚合（按在架款式数倒序） */
    @Select("SELECT category AS category, COUNT(*) AS cnt FROM t_style_info "
            + "WHERE shop_listed = 1 AND category IS NOT NULL AND category != '' "
            + "GROUP BY category ORDER BY cnt DESC LIMIT 20")
    List<Map<String, Object>> listCategories();

    /** 平台只读总览：店铺 / 在架款式 / 注册用户 / 订单 计数 */
    @Select("SELECT "
            + " (SELECT COUNT(*) FROM t_shop_config) AS shopCount, "
            + " (SELECT COUNT(*) FROM t_shop_config WHERE enabled = 1) AS openShopCount, "
            + " (SELECT COUNT(*) FROM t_style_info WHERE shop_listed = 1) AS listedStyleCount, "
            + " (SELECT COUNT(*) FROM t_shop_consumer WHERE status = 1) AS consumerCount, "
            + " (SELECT COUNT(*) FROM t_shop_order WHERE delete_flag = 0) AS orderCount, "
            + " (SELECT COALESCE(SUM(total_amount), 0) FROM t_shop_order WHERE delete_flag = 0) AS orderAmount")
    Map<String, Object> platformOverview();

    /** 平台只读总览：跨租户最近店铺订单（脱敏，只给展示所需字段） */
    @Select("SELECT o.order_no AS orderNo, o.tenant_id AS tenantId, o.customer_name AS customerName, "
            + "       o.total_amount AS totalAmount, o.item_count AS itemCount, o.status AS status, "
            + "       o.create_time AS createTime, c.shop_name AS shopName, c.slug AS slug "
            + "FROM t_shop_order o "
            + "LEFT JOIN t_shop_config c ON c.tenant_id = o.tenant_id "
            + "WHERE o.delete_flag = 0 "
            + "ORDER BY o.create_time DESC LIMIT #{limit}")
    List<Map<String, Object>> listRecentOrders(@Param("limit") int limit);

    /** 已登录消费者自己的订单（跨店；按 consumer_id 精确归属，不做模糊匹配） */
    @Select("SELECT o.order_no AS orderNo, o.tenant_id AS tenantId, o.customer_name AS customerName, "
            + "       o.phone AS phone, o.address AS address, o.total_amount AS totalAmount, "
            + "       o.goods_amount AS goodsAmount, o.shipping_fee AS shippingFee, "
            + "       o.item_count AS itemCount, o.status AS status, o.express_company AS expressCompany, "
            + "       o.express_no AS expressNo, o.create_time AS createTime, "
            + "       c.shop_name AS shopName, c.slug AS slug "
            + "FROM t_shop_order o "
            + "LEFT JOIN t_shop_config c ON c.tenant_id = o.tenant_id "
            + "WHERE o.consumer_id = #{consumerId} AND o.delete_flag = 0 "
            + "ORDER BY o.create_time DESC LIMIT 100")
    List<Map<String, Object>> listOrdersByConsumer(@Param("consumerId") String consumerId);

    /* ── P1：跨店购物车 ─────────────────────────────────────────────────── */

    /**
     * 购物车明细（一次查全：SKU + 款式 + 店铺），供 C 端渲染与结算前校验。
     *
     * <p>把「已下架 / 店铺打烊 / 库存不足」一起查出来交给调用方判定，
     * 而不是在 SQL 里过滤掉 —— 购物车里失效的商品要**显示出来并说明原因**，
     * 直接静默消失会让顾客以为商品被吞了。
     */
    @Select("SELECT ci.id AS cartItemId, ci.sku_id AS skuId, ci.tenant_id AS tenantId, "
            + "       ci.quantity AS quantity, ci.create_time AS createTime, "
            + "       sku.sku_code AS skuCode, sku.color AS color, sku.size AS size, "
            + "       sku.sales_price AS salesPrice, sku.stock_quantity AS stockQuantity, "
            + "       sku.sku_color_image AS image, sku.style_id AS styleId, "
            + "       st.style_no AS styleNo, st.style_name AS styleName, st.cover AS cover, "
            + "       st.shop_listed AS shopListed, "
            + "       cfg.slug AS slug, cfg.shop_name AS shopName, cfg.enabled AS shopEnabled "
            + "FROM t_shop_cart_item ci "
            + "LEFT JOIN t_product_sku sku ON sku.id = ci.sku_id "
            + "LEFT JOIN t_style_info st ON st.id = sku.style_id "
            + "LEFT JOIN t_shop_config cfg ON cfg.tenant_id = ci.tenant_id "
            + "WHERE ci.consumer_id = #{consumerId} "
            + "ORDER BY ci.tenant_id ASC, ci.create_time DESC")
    List<Map<String, Object>> listCartRows(@Param("consumerId") String consumerId);

    /* ── P1：订单详情 ───────────────────────────────────────────────────── */

    /**
     * 按订单号取订单（**必须同时匹配 consumerId** 才返回）。
     * 订单号是全局唯一键，但归属校验绝不能省 —— 否则改一个订单号就能看别人的订单。
     */
    @Select("SELECT o.id AS orderId, o.order_no AS orderNo, o.tenant_id AS tenantId, "
            + "       o.customer_name AS customerName, "
            + "       o.phone AS phone, o.address AS address, o.total_amount AS totalAmount, "
            + "       o.goods_amount AS goodsAmount, o.shipping_fee AS shippingFee, "
            + "       o.item_count AS itemCount, o.status AS status, o.remark AS remark, "
            + "       o.express_company AS expressCompany, o.express_no AS expressNo, "
            + "       o.ship_time AS shipTime, o.cancel_reason AS cancelReason, "
            + "       o.after_sale_status AS afterSaleStatus, o.after_sale_type AS afterSaleType, "
            + "       o.after_sale_reason AS afterSaleReason, o.after_sale_remark AS afterSaleRemark, "
            + "       o.create_time AS createTime, "
            + "       c.shop_name AS shopName, c.slug AS slug "
            + "FROM t_shop_order o "
            + "LEFT JOIN t_shop_config c ON c.tenant_id = o.tenant_id "
            + "WHERE o.order_no = #{orderNo} AND o.consumer_id = #{consumerId} "
            + "  AND o.delete_flag = 0 LIMIT 1")
    Map<String, Object> findOrderForConsumer(@Param("orderNo") String orderNo,
                                             @Param("consumerId") String consumerId);

    /** 订单商品明细（按订单号；订单号全局唯一，故无需再加租户条件） */
    @Select("SELECT sku_id AS skuId, sku_code AS skuCode, style_no AS styleNo, style_name AS styleName, "
            + "       color AS color, size AS size, unit_price AS unitPrice, "
            + "       quantity AS quantity, amount AS amount "
            + "FROM t_shop_order_item WHERE order_id = "
            + "  (SELECT id FROM t_shop_order WHERE order_no = #{orderNo} LIMIT 1)")
    List<Map<String, Object>> listOrderItems(@Param("orderNo") String orderNo);

    /** 按 租户 + 款号 反查款式 ID（评价要落到 style_id 上才能在商品页展示） */
    @Select("SELECT id FROM t_style_info WHERE tenant_id = #{tenantId} AND style_no = #{styleNo} LIMIT 1")
    Long findStyleIdByNo(@Param("tenantId") Long tenantId, @Param("styleNo") String styleNo);

    /* ── P2：商品评价 ───────────────────────────────────────────────────── */

    /**
     * 按款式批量取评价统计（均分 + 条数）——商品池卡片展示用。
     * 均分保留一位小数，由 SQL 侧 ROUND 完成，避免各端各自取整口径不一。
     */
    @Select("<script>"
            + "SELECT style_id AS styleId, COUNT(*) AS cnt, ROUND(AVG(rating), 1) AS avgRating "
            + "FROM t_shop_review WHERE style_id IN "
            + "<foreach collection='styleIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>"
            + " GROUP BY style_id"
            + "</script>")
    List<Map<String, Object>> listReviewStatsByStyleIds(@Param("styleIds") List<Long> styleIds);

    /**
     * 某款式的评价列表（最新在前）。
     * 昵称在 SQL 侧拼好：匿名→「匿名用户」，否则用消费者昵称，昵称缺失回落到手机号后四位。
     * 只返回展示所需字段，**不含手机号全量、不含 consumer_id**。
     */
    @Select("SELECT r.rating AS rating, r.content AS content, r.create_time AS createTime, "
            + "       r.style_no AS styleNo, "
            + "       CASE WHEN r.anonymous = 1 THEN '匿名用户' "
            + "            ELSE COALESCE(NULLIF(c.nickname, ''), CONCAT('用户', RIGHT(c.phone, 4))) END AS nickname "
            + "FROM t_shop_review r "
            + "LEFT JOIN t_shop_consumer c ON c.id = r.consumer_id "
            + "WHERE r.style_id = #{styleId} "
            + "ORDER BY r.create_time DESC LIMIT #{limit}")
    List<Map<String, Object>> listReviewsByStyleId(@Param("styleId") Long styleId,
                                                   @Param("limit") int limit);

    /** 某订单的评价（用于「我的订单详情」标记哪些商品已评价） */
    @Select("SELECT r.style_no AS styleNo, r.rating AS rating, r.content AS content, "
            + "       r.create_time AS createTime "
            + "FROM t_shop_review r WHERE r.order_no = #{orderNo}")
    List<Map<String, Object>> listReviewsByOrderNo(@Param("orderNo") String orderNo);
}
