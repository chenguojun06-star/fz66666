package com.fashion.supplychain.style.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ProductSkuMapper extends BaseMapper<ProductSku> {

    // t_product_sku 无 delete_flag 列，不加该条件（加了会报 ERROR 1054 导致所有库存更新静默失败）
    @Update("UPDATE t_product_sku SET stock_quantity = GREATEST(COALESCE(stock_quantity, 0) + #{delta}, 0), " +
            "update_time = NOW() WHERE sku_code = #{skuCode} " +
            "AND (#{tenantId} IS NULL OR tenant_id = #{tenantId})")
    int updateStockBySkuCode(@Param("skuCode") String skuCode, @Param("delta") int delta, @Param("tenantId") Long tenantId);

    @Update("UPDATE t_product_sku SET stock_quantity = stock_quantity - #{delta}, " +
            "update_time = NOW() WHERE sku_code = #{skuCode} AND stock_quantity >= #{delta} " +
            "AND (#{tenantId} IS NULL OR tenant_id = #{tenantId})")
    int decreaseStockBySkuCode(@Param("skuCode") String skuCode, @Param("delta") int delta, @Param("tenantId") Long tenantId);

    @Update("UPDATE t_product_sku SET stock_quantity = GREATEST(0, stock_quantity + #{delta}), " +
            "update_time = NOW() WHERE id = #{id}ock_quantity + #{delta}), " +
            "update_time = NOW() WHERE id = #{id} " +
            "AND (#{tenantId} IS NULL OR tenant_id = #{tenantId})")
    int updateStockById(@Param("id") Long id, @Param("delta") int delta, @Param("tenantId") Long tenantId);
}
