package com.fashion.supplychain.shop.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 店铺数据看板查询。
 *
 * <p><b>为什么订单类指标实时查而不落计数器</b>：{@code t_shop_order} 是逐单落行的事实表，
 * 按日期聚合就能得到准确结果；再抄一份到日报表，两份数据迟早对不上
 * （本项目已经因为「派生数据不一致」栽过跟头）。只有购物车行会被删除、
 * 浏览日志被合并计数这两项算不出来，才落计数器（见 {@code ShopStatDailyMapper}）。
 *
 * <p>带 tenant_id 条件且**不加** {@code @InterceptorIgnore}：看板是商家看自己店铺的数据，
 * 租户隔离必须继续生效（双保险：SQL 显式条件 + 拦截器自动追加）。
 */
@Mapper
public interface ShopDashboardMapper {

    /**
     * 按天统计下单数与下单金额（剔除已取消订单）。
     *
     * <p>「下单」即「挂应收」——本系统订单落库就生成应收，所以下单数与成交口径一致，
     * 不存在「下了单没付钱」的中间态，无需再拆两个数。
     */
    @Select("SELECT DATE(create_time) AS statDate, COUNT(*) AS orderCount, "
            + "       COALESCE(SUM(total_amount), 0) AS orderAmount "
            + "FROM t_shop_order "
            + "WHERE tenant_id = #{tenantId} AND delete_flag = 0 AND status != 'CANCELLED' "
            + "  AND create_time >= DATE_SUB(CURDATE(), INTERVAL #{days} DAY) "
            + "GROUP BY DATE(create_time) "
            + "ORDER BY statDate ASC")
    List<Map<String, Object>> dailyOrders(@Param("tenantId") Long tenantId,
                                          @Param("days") int days);

    /** 汇总：区间内的下单数与下单金额（用于顶部「今日 / 近 7 天 / 近 30 天」卡片） */
    @Select("SELECT COUNT(*) AS orderCount, COALESCE(SUM(total_amount), 0) AS orderAmount "
            + "FROM t_shop_order "
            + "WHERE tenant_id = #{tenantId} AND delete_flag = 0 AND status != 'CANCELLED' "
            + "  AND create_time >= DATE_SUB(CURDATE(), INTERVAL #{days} DAY)")
    Map<String, Object> summaryOrders(@Param("tenantId") Long tenantId,
                                      @Param("days") int days);
}
