package com.fashion.supplychain.shop.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.shop.entity.ShopConsumer;
import org.apache.ibatis.annotations.Mapper;

/**
 * 平台级 C 端消费者账号 Mapper。
 *
 * <p>本表**无 tenant_id**，已在 {@code TenantInterceptor.EXCLUDED_TABLES} 中登记为
 * 「不参与租户隔离的全局表」——否则在带租户上下文的线程里查询会拼出
 * {@code AND tenant_id = X} 而直接 SQL 报错。
 */
@Mapper
public interface ShopConsumerMapper extends BaseMapper<ShopConsumer> {
}
