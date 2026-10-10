package com.fashion.supplychain.shop.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.shop.entity.ShopStatDaily;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 店铺经营日报计数器 Mapper。
 *
 * <p>刻意不加 {@code @InterceptorIgnore}：本表带 tenant_id，是租户业务数据。
 * C 端公开链路没有 UserContext（拦截器本就跳过），商家侧看板有租户上下文，
 * 两边都按传入/上下文的 tenant_id 走，不需要绕过。
 */
@Mapper
public interface ShopStatDailyMapper extends BaseMapper<ShopStatDaily> {

    /**
     * 浏览 +1。
     *
     * <p>用 {@code ON DUPLICATE KEY UPDATE} 累加而不是「先查再改」：详情页并发访问很常见，
     * 先查再改会丢计数。
     */
    @Insert("INSERT INTO t_shop_stat_daily (tenant_id, stat_date, browse_count, cart_add_count) "
            + "VALUES (#{tenantId}, CURDATE(), 1, 0) "
            + "ON DUPLICATE KEY UPDATE browse_count = browse_count + 1")
    int bumpBrowse(@Param("tenantId") Long tenantId);

    /** 加购 +1（同样用 upsert 累加，避免并发丢计数） */
    @Insert("INSERT INTO t_shop_stat_daily (tenant_id, stat_date, browse_count, cart_add_count) "
            + "VALUES (#{tenantId}, CURDATE(), 0, 1) "
            + "ON DUPLICATE KEY UPDATE cart_add_count = cart_add_count + 1")
    int bumpCartAdd(@Param("tenantId") Long tenantId);

    /** 取某租户最近 N 天的计数（只有浏览/加购两列，订单类指标另查） */
    @Select("SELECT stat_date AS statDate, browse_count AS browseCount, "
            + "       cart_add_count AS cartAddCount "
            + "FROM t_shop_stat_daily "
            + "WHERE tenant_id = #{tenantId} AND stat_date >= DATE_SUB(CURDATE(), INTERVAL #{days} DAY) "
            + "ORDER BY stat_date ASC")
    List<Map<String, Object>> recentStats(@Param("tenantId") Long tenantId,
                                          @Param("days") int days);
}
