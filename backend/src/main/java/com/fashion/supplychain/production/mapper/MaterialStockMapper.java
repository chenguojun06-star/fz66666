package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.MaterialStock;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface MaterialStockMapper extends BaseMapper<MaterialStock> {

    @Update("UPDATE t_material_stock SET quantity = quantity + #{delta}, update_time = NOW() WHERE id = #{id}")
    int updateStockQuantity(@Param("id") String id, @Param("delta") int delta);

    @Update("UPDATE t_material_stock SET quantity = quantity - #{delta}, update_time = NOW() WHERE id = #{id} AND quantity >= #{delta}")
    int decreaseStockWithCheck(@Param("id") String id, @Param("delta") int delta);

    /**
     * 入库时更新库存：数量+仓位+单价+总值+供应商+入库日期
     * 使用加权平均单价：新单价 = (旧数量×旧单价 + 入库数量×采购单价) / (旧数量+入库数量)
     */
    @Update("UPDATE t_material_stock SET " +
            "quantity = quantity + #{delta}, " +
            "location = COALESCE(#{location}, location), " +
            "unit_price = CASE " +
            "  WHEN #{unitPrice} IS NOT NULL AND #{unitPrice} > 0 THEN " +
            "    ROUND((COALESCE(quantity, 0) * COALESCE(unit_price, 0) + #{delta} * #{unitPrice}) / (COALESCE(quantity, 0) + #{delta}), 2) " +
            "  ELSE COALESCE(unit_price, 0) END, " +
            "total_value = CASE " +
            "  WHEN #{unitPrice} IS NOT NULL AND #{unitPrice} > 0 THEN " +
            "    ROUND((COALESCE(quantity, 0) * COALESCE(unit_price, 0) + #{delta} * #{unitPrice}), 2) " +
            "  ELSE ROUND((COALESCE(quantity, 0) + #{delta}) * COALESCE(unit_price, 0), 2) END, " +
            "supplier_name = COALESCE(#{supplierName}, supplier_name), " +
            "last_inbound_date = NOW(), " +
            "update_time = NOW() " +
            "WHERE id = #{id}")
    int updateStockOnInbound(@Param("id") String id,
                             @Param("delta") int delta,
                             @Param("location") String location,
                             @Param("unitPrice") java.math.BigDecimal unitPrice,
                             @Param("supplierName") String supplierName);
}
