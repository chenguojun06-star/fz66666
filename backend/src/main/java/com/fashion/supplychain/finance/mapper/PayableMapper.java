package com.fashion.supplychain.finance.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.finance.entity.Payable;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;

@Mapper
public interface PayableMapper extends BaseMapper<Payable> {

    @Update("UPDATE t_payable SET " +
            "paid_amount = COALESCE(paid_amount, 0) + #{delta}, " +
            "status = CASE WHEN COALESCE(paid_amount, 0) + #{delta} >= COALESCE(amount, 0) THEN 'PAID' ELSE 'PARTIAL' END, " +
            "update_time = NOW() " +
            "WHERE id = #{id} AND delete_flag = 0")
    int atomicAddPaidAmount(@Param("id") String id, @Param("delta") BigDecimal delta);
}
