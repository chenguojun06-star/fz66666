package com.fashion.supplychain.finance.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;

@Mapper
public interface PayrollSettlementMapper extends BaseMapper<PayrollSettlement> {

    @Update("UPDATE t_payroll_settlement SET " +
            "paid_amount = COALESCE(paid_amount, 0) + #{delta}, " +
            "remaining_amount = total_amount - (COALESCE(paid_amount, 0) + #{delta}), " +
            "payment_status = CASE WHEN total_amount - (COALESCE(paid_amount, 0) + #{delta}) <= 0 THEN 'fully_paid' ELSE 'partially_paid' END, " +
            "settlement_time = CASE WHEN total_amount - (COALESCE(paid_amount, 0) + #{delta}) <= 0 THEN NOW() ELSE settlement_time END, " +
            "update_time = NOW() " +
            "WHERE id = #{id} AND COALESCE(paid_amount, 0) = #{expectedPaidAmount}")
    int atomicAddPaidAmount(@Param("id") String id, @Param("delta") BigDecimal delta, @Param("expectedPaidAmount") BigDecimal expectedPaidAmount);

    @Update("UPDATE t_payroll_settlement SET " +
            "deduction_amount = COALESCE(deduction_amount, 0) + #{delta}, " +
            "remaining_amount = GREATEST(total_amount - COALESCE(paid_amount, 0) - (COALESCE(deduction_amount, 0) + #{delta}) - COALESCE(advance_amount, 0), 0), " +
            "update_time = NOW() " +
            "WHERE id = #{id} AND COALESCE(deduction_amount, 0) = #{expectedDeductionAmount}")
    int atomicAddDeductionAmount(@Param("id") String id, @Param("delta") BigDecimal delta, @Param("expectedDeductionAmount") BigDecimal expectedDeductionAmount);
}
