package com.fashion.supplychain.shop.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.shop.entity.ShopReview;
import org.apache.ibatis.annotations.Mapper;

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
}
