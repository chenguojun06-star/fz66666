package com.fashion.supplychain.shop.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.shop.entity.ShopConsumerAddress;
import org.apache.ibatis.annotations.Mapper;

/**
 * 平台级 C 端收货地址簿 Mapper（无 tenant_id，见 TenantInterceptor.EXCLUDED_TABLES）。
 */
@Mapper
public interface ShopConsumerAddressMapper extends BaseMapper<ShopConsumerAddress> {
}
