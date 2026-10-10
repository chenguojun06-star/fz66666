package com.fashion.supplychain.pos.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.pos.entity.PosSale;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 收银台销售单 Mapper。
 *
 * <p>不加 {@code @InterceptorIgnore}：销售单是租户业务数据，必须继续享受租户隔离。
 */
@Mapper
public interface PosSaleMapper extends BaseMapper<PosSale> {

    /** 今日按收款方式汇总（交班对账用） */
    @Select("SELECT pay_method AS payMethod, pay_status AS payStatus, "
            + "       COUNT(*) AS saleCount, COALESCE(SUM(total_amount), 0) AS amount "
            + "FROM t_pos_sale "
            + "WHERE tenant_id = #{tenantId} AND status = 'NORMAL' AND DATE(create_time) = CURDATE() "
            + "GROUP BY pay_method, pay_status "
            + "ORDER BY amount DESC")
    List<Map<String, Object>> todayByPayMethod(@Param("tenantId") Long tenantId);

    /** 今日汇总（单数 / 件数 / 金额 / 挂账金额） */
    @Select("SELECT COUNT(*) AS saleCount, COALESCE(SUM(item_count), 0) AS itemCount, "
            + "       COALESCE(SUM(total_amount), 0) AS amount, "
            + "       COALESCE(SUM(CASE WHEN pay_status = 'UNPAID' THEN total_amount ELSE 0 END), 0) AS creditAmount "
            + "FROM t_pos_sale "
            + "WHERE tenant_id = #{tenantId} AND status = 'NORMAL' AND DATE(create_time) = CURDATE()")
    Map<String, Object> todaySummary(@Param("tenantId") Long tenantId);

    /**
     * 某客户最近成交单价（批发档口最需要的「上次这个客户拿的什么价」）。
     *
     * <p>只取该客户**最近一次**成交的单价：翻更早的价格没有意义
     * （档口价格随行就市，上一次就是当前基准）。
     */
    @Select("SELECT i.sku_id AS skuId, i.unit_price AS unitPrice "
            + "FROM t_pos_sale_item i "
            + "JOIN t_pos_sale s ON s.id = i.sale_id "
            + "WHERE s.tenant_id = #{tenantId} AND s.customer_phone = #{phone} "
            + "  AND s.status = 'NORMAL' AND i.sku_id IS NOT NULL "
            + "  AND s.create_time >= DATE_SUB(NOW(), INTERVAL 180 DAY) "
            + "ORDER BY s.create_time DESC LIMIT 200")
    List<Map<String, Object>> customerRecentPrices(@Param("tenantId") Long tenantId,
                                                   @Param("phone") String phone);

    /** 今日最近单据（收银台右侧「今日单据」用） */
    @Select("SELECT id AS id, sale_no AS saleNo, customer_name AS customerName, "
            + "       item_count AS itemCount, total_amount AS totalAmount, "
            + "       pay_method AS payMethod, pay_status AS payStatus, "
            + "       create_time AS createTime "
            + "FROM t_pos_sale "
            + "WHERE tenant_id = #{tenantId} AND status = 'NORMAL' AND DATE(create_time) = CURDATE() "
            + "ORDER BY create_time DESC LIMIT #{limit}")
    List<Map<String, Object>> todayRecent(@Param("tenantId") Long tenantId,
                                          @Param("limit") int limit);
}
