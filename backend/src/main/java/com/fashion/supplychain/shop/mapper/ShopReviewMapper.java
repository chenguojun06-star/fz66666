package com.fashion.supplychain.shop.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.shop.entity.ShopReview;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 商品评价 Mapper（P2）。
 *
 * <p><b>刻意不加 {@code @InterceptorIgnore}</b>：评价带 tenant_id，是租户业务数据 ——
 * 商家在后台查自己店铺的评价时必须继续享受租户隔离。
 * C 端公开链路没有 UserContext，拦截器本来就跳过，跨租户聚合（按款式求均分）
 * 由 {@code ShopPlatformMapper} 的显式跨租户查询承担。
 */
@Mapper
public interface ShopReviewMapper extends BaseMapper<ShopReview> {

    /**
     * 本租户各星级评价条数（商家口碑概览）。
     * 显式带 tenant_id 条件 —— 与拦截器自动追加的那条重复也无害，
     * 但保证任何上下文下都不会读到别家数据。
     */
    @Select("SELECT rating AS rating, COUNT(*) AS cnt FROM t_shop_review "
            + "WHERE tenant_id = #{tenantId} GROUP BY rating")
    List<Map<String, Object>> countByRating(@Param("tenantId") Long tenantId);
}
