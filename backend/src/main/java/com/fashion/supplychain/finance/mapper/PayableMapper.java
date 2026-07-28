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
            "WHERE id = #{id} AND tenant_id = #{tenantId} AND delete_flag = 0")
    int atomicAddPaidAmount(@Param("id") String id, @Param("delta") BigDecimal delta, @Param("tenantId") Long tenantId);

    /**
     * 原子累加退货冲减金额（独立于 paid_amount，区分真实付款与退货冲减）
     * <p>
     * 语义：采购退货时调用，记录供应商应退回的金额
     * - returned_amount 累加退货金额（正数）
     * - 不影响 paid_amount（已付款金额）
     * - 若 returned_amount >= amount - paid_amount，表示退货已覆盖未付款部分，状态置为 PAID
     */
    @Update("UPDATE t_payable SET " +
            "returned_amount = COALESCE(returned_amount, 0) + #{delta}, " +
            "status = CASE WHEN COALESCE(returned_amount, 0) + #{delta} >= COALESCE(amount, 0) - COALESCE(paid_amount, 0) " +
            "  AND COALESCE(amount, 0) - COALESCE(paid_amount, 0) >= 0 THEN 'PAID' ELSE status END, " +
            "update_time = NOW() " +
            "WHERE id = #{id} AND tenant_id = #{tenantId} AND delete_flag = 0")
    int atomicAddReturnedAmount(@Param("id") String id, @Param("delta") BigDecimal delta, @Param("tenantId") Long tenantId);
}
