package com.fashion.supplychain.style.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ProductSkuMapper extends BaseMapper<ProductSku> {

    @Update("UPDATE t_product_sku SET stock_quantity = GREATEST(COALESCE(stock_quantity, 0) + #{delta}, 0), " +
            "update_time = NOW() WHERE sku_code = #{skuCode} AND tenant_id = #{tenantId}")
    int updateStockBySkuCode(@Param("skuCode") String skuCode, @Param("delta") int delta, @Param("tenantId") Long tenantId);

    @Update("UPDATE t_product_sku SET stock_quantity = stock_quantity - #{delta}, " +
            "update_time = NOW() WHERE sku_code = #{skuCode} AND stock_quantity >= #{delta} " +
            "AND tenant_id = #{tenantId}")
    int decreaseStockBySkuCode(@Param("skuCode") String skuCode, @Param("delta") int delta, @Param("tenantId") Long tenantId);

    @Update("UPDATE t_product_sku SET stock_quantity = GREATEST(0, stock_quantity + #{delta}), " +
            "update_time = NOW() WHERE id = #{id} AND tenant_id = #{tenantId}")
    int updateStockById(@Param("id") Long id, @Param("delta") int delta, @Param("tenantId") Long tenantId);

    /**
     * 加权平均法更新成本价（库存由其他逻辑更新，此处只更新成本价）
     * 注意：调用此方法前需确保库存尚未更新，计算时使用的是更新前的库存
     * newCostPrice = (oldStock * oldCostPrice + inboundQty * inboundUnitPrice) / (oldStock + inboundQty)
     */
    @Update("UPDATE t_product_sku SET " +
            "  cost_price = CASE " +
            "    WHEN COALESCE(stock_quantity, 0) + #{inboundQty} <= 0 THEN #{inboundUnitPrice} " +
            "    ELSE (COALESCE(stock_quantity, 0) * COALESCE(cost_price, 0) + #{inboundQty} * #{inboundUnitPrice}) / (COALESCE(stock_quantity, 0) + #{inboundQty}) " +
            "  END, " +
            "  update_time = NOW() " +
            "WHERE sku_code = #{skuCode} AND tenant_id = #{tenantId}")
    int updateCostPriceBySkuCode(@Param("skuCode") String skuCode,
                                  @Param("inboundQty") int inboundQty,
                                  @Param("inboundUnitPrice") java.math.BigDecimal inboundUnitPrice,
                                  @Param("tenantId") Long tenantId);
}
