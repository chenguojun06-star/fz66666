package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.MaterialStock;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface MaterialStockMapper extends BaseMapper<MaterialStock> {

    @Update("UPDATE t_material_stock SET " +
            "locked_quantity = locked_quantity + #{delta}, " +
            "update_time = NOW() WHERE id = #{id} AND delete_flag = 0 " +
            "AND tenant_id = #{tenantId} " +
            "AND (quantity - locked_quantity) >= #{delta}")
    int lockStock(@Param("id") String id, @Param("delta") int delta, @Param("tenantId") Long tenantId);

    @Update("UPDATE t_material_stock SET " +
            "locked_quantity = GREATEST(0, locked_quantity - #{delta}), " +
            "update_time = NOW() WHERE id = #{id} AND delete_flag = 0 " +
            "AND tenant_id = #{tenantId}")
    int unlockStock(@Param("id") String id, @Param("delta") int delta, @Param("tenantId") Long tenantId);

    @Update("UPDATE t_material_stock SET " +
            "quantity = quantity - #{delta}, " +
            "locked_quantity = GREATEST(0, locked_quantity - #{delta}), " +
            // D-070: MySQL SET从左到右求值，此处quantity已是扣减后的新值，直接相乘即为正确总值
            "total_value = ROUND(GREATEST(0, quantity) * COALESCE(unit_price, 0), 2), " +
            "update_time = NOW() WHERE id = #{id} AND quantity >= #{delta} AND delete_flag = 0 " +
            "AND tenant_id = #{tenantId}")
    int decreaseStockAndUnlock(@Param("id") String id, @Param("delta") int delta, @Param("tenantId") Long tenantId);

    @Update("UPDATE t_material_stock SET " +
            "quantity = GREATEST(0, quantity + #{delta}), " +
            // D-070: quantity此处已是更新后的新值，直接相乘
            "total_value = ROUND(GREATEST(0, quantity) * COALESCE(unit_price, 0), 2), " +
            "update_time = NOW() WHERE id = #{id} AND delete_flag = 0 " +
            "AND tenant_id = #{tenantId}")
    int updateStockQuantity(@Param("id") String id, @Param("delta") int delta, @Param("tenantId") Long tenantId);

    @Update("UPDATE t_material_stock SET " +
            "quantity = quantity - #{delta}, " +
            // D-070: quantity此处已是扣减后的新值
            "total_value = ROUND(GREATEST(0, quantity) * COALESCE(unit_price, 0), 2), " +
            "update_time = NOW() WHERE id = #{id} AND quantity >= #{delta} AND delete_flag = 0 " +
            "AND tenant_id = #{tenantId} " +
            "AND (quantity - locked_quantity) >= #{delta}")
    int decreaseStockWithCheck(@Param("id") String id, @Param("delta") int delta, @Param("tenantId") Long tenantId);

    @Update("UPDATE t_material_stock SET " +
            // D-070: 加权单价须用扣减前的旧quantity计算，故unit_price的CASE放在quantity赋值之前（MySQL从左到右求值）
            "unit_price = CASE " +
            "  WHEN #{unitPrice} IS NOT NULL AND #{unitPrice} > 0 THEN " +
            "    ROUND((COALESCE(quantity, 0) * COALESCE(unit_price, 0) + #{delta} * #{unitPrice}) / (COALESCE(quantity, 0) + #{delta}), 2) " +
            "  ELSE COALESCE(unit_price, 0) END, " +
            "quantity = quantity + #{delta}, " +
            "location = COALESCE(#{location}, location), " +
            // quantity与unit_price此处均为新值，直接相乘
            "total_value = ROUND(COALESCE(quantity, 0) * COALESCE(unit_price, 0), 2), " +
            "supplier_name = COALESCE(#{supplierName}, supplier_name), " +
            "last_inbound_date = NOW(), " +
            "update_time = NOW() " +
            "WHERE id = #{id} AND delete_flag = 0 " +
            "AND tenant_id = #{tenantId}")
    int updateStockOnInbound(@Param("id") String id,
                             @Param("delta") int delta,
                             @Param("location") String location,
                             @Param("unitPrice") java.math.BigDecimal unitPrice,
                             @Param("supplierName") String supplierName,
                             @Param("tenantId") Long tenantId);
}
