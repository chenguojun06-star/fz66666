package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.ProductOutstock;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;

@Mapper
public interface ProductOutstockMapper extends BaseMapper<ProductOutstock> {

    @Update("UPDATE t_product_outstock SET " +
            "paid_amount = COALESCE(paid_amount, 0) + #{delta}, " +
            "payment_status = CASE WHEN COALESCE(paid_amount, 0) + #{delta} >= COALESCE(total_amount, 0) THEN 'paid' ELSE 'partial' END, " +
            "settlement_time = CASE WHEN COALESCE(paid_amount, 0) + #{delta} >= COALESCE(total_amount, 0) THEN NOW() ELSE settlement_time END, " +
            "update_time = NOW() " +
            "WHERE id = #{id}")
    int atomicAddPaidAmount(@Param("id") String id, @Param("delta") BigDecimal delta);
}
