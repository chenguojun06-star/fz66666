package com.fashion.supplychain.shop.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.shop.entity.ShopBrowseLog;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 顾客浏览行为 Mapper（D-784）
 *
 * <p>刻意不加 {@code @InterceptorIgnore}：浏览数据带 tenant_id，是租户业务数据。
 */
@Mapper
public interface ShopBrowseLogMapper extends BaseMapper<ShopBrowseLog> {

    /**
     * 记一次浏览，重复浏览合并计数。
     *
     * <p>用 ON DUPLICATE KEY UPDATE 而不是「先查再插」：并发下两个请求会同时查不到
     * 然后都去插，唯一键冲突后其中一个报错，行为就会丢。
     */
    @Insert("INSERT INTO t_shop_browse_log "
            + "(tenant_id, consumer_id, style_id, style_no, view_count, first_time, last_time) "
            + "VALUES (#{tenantId}, #{consumerId}, #{styleId}, #{styleNo}, 1, NOW(), NOW()) "
            + "ON DUPLICATE KEY UPDATE view_count = view_count + 1, last_time = NOW()")
    int recordView(@Param("tenantId") Long tenantId,
                   @Param("consumerId") String consumerId,
                   @Param("styleId") Long styleId,
                   @Param("styleNo") String styleNo);

    /**
     * 该顾客最近的浏览款式（按最近浏览时间倒序）。
     *
     * <p>带 LIMIT —— 浏览历史可能上千条，推荐只需要近期偏好，
     * 全量取既慢又会让很早的浏览过度影响当前推荐。
     */
    @Select("SELECT style_id AS styleId, style_no AS styleNo, view_count AS viewCount, last_time AS lastTime "
            + "FROM t_shop_browse_log WHERE tenant_id = #{tenantId} AND consumer_id = #{consumerId} "
            + "ORDER BY last_time DESC LIMIT #{limit}")
    List<Map<String, Object>> recentViews(@Param("tenantId") Long tenantId,
                                          @Param("consumerId") String consumerId,
                                          @Param("limit") int limit);

    /**
     * 店铺内被浏览最多的款式（热度兜底）。
     *
     * <p>匿名访客或新顾客没有个人历史时用它兜底，避免底部开天窗。
     */
    @Select("SELECT style_id AS styleId, SUM(view_count) AS totalViews FROM t_shop_browse_log "
            + "WHERE tenant_id = #{tenantId} GROUP BY style_id ORDER BY totalViews DESC LIMIT #{limit}")
    List<Map<String, Object>> hottestStyles(@Param("tenantId") Long tenantId,
                                            @Param("limit") int limit);
}