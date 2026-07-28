package com.fashion.supplychain.finance.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;

@Mapper
public interface ShipmentReconciliationMapper extends BaseMapper<ShipmentReconciliation> {

    @Update("UPDATE t_shipment_reconciliation SET " +
            "deduction_amount = (" +
            "  SELECT COALESCE(SUM(CASE WHEN di.deduction_type != 'SUPPLEMENT' THEN di.deduction_amount ELSE 0 END), 0) " +
            "  FROM t_deduction_item di WHERE di.reconciliation_id = #{id} AND di.tenant_id = #{tenantId}" +
            "), " +
            "final_amount = COALESCE(total_amount, 0) - (" +
            "  SELECT COALESCE(SUM(CASE WHEN di.deduction_type != 'SUPPLEMENT' THEN di.deduction_amount ELSE 0 END), 0) " +
            "  FROM t_deduction_item di WHERE di.reconciliation_id = #{id} AND di.tenant_id = #{tenantId}" +
            ") + (" +
            "  SELECT COALESCE(SUM(CASE WHEN di.deduction_type = 'SUPPLEMENT' THEN di.deduction_amount ELSE 0 END), 0) " +
            "  FROM t_deduction_item di WHERE di.reconciliation_id = #{id} AND di.tenant_id = #{tenantId}" +
            "), " +
            "update_time = NOW() " +
            "WHERE id = #{id} AND tenant_id = #{tenantId}")
    int recalculateDeductionAndFinal(@Param("id") String reconciliationId, @Param("tenantId") Long tenantId);
}
