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
}
