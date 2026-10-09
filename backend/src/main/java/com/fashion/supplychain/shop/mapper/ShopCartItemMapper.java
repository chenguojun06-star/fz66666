package com.fashion.supplychain.shop.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.shop.entity.ShopCartItem;
import org.apache.ibatis.annotations.Mapper;

/**
 * 平台级购物车 Mapper（P1）。
 *
 * <p>类级 {@code @InterceptorIgnore(tenantLine = "true")}：购物车是**平台级**数据，
 * 一辆车里混着多个店铺的商品，绝不能被追加 {@code AND tenant_id = 当前租户}。
 * 归属隔离一律靠显式 {@code consumer_id} 条件（消费者 id 只来自令牌解析，不接受请求参数）。
 *
 * <p>该表的 {@code tenant_id} 只是「商品属于哪个店」的业务字段，不是隔离维度。
 */
@Mapper
@InterceptorIgnore(tenantLine = "true")
public interface ShopCartItemMapper extends BaseMapper<ShopCartItem> {
}
