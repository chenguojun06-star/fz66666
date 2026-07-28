package com.fashion.supplychain.finance.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.finance.entity.EmployeeAdvance;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;

@Mapper
public interface EmployeeAdvanceMapper extends BaseMapper<EmployeeAdvance> {

    @Update("UPDATE t_employee_advance SET " +
            "repayment_amount = repayment_amount + #{delta}, " +
            "remaining_amount = amount - (repayment_amount + #{delta}), " +
            "repayment_status = CASE WHEN amount - (repayment_amount + #{delta}) = 0 THEN 'repaid' ELSE 'partial' END, " +
            "update_time = NOW() " +
            "WHERE id = #{id} AND tenant_id = #{tenantId} AND repayment_amount = #{expectedRepaymentAmount}")
    int atomicRepay(@Param("id") String id,
                    @Param("delta") BigDecimal delta,
                    @Param("expectedRepaymentAmount") BigDecimal expectedRepaymentAmount,
                    @Param("tenantId") Long tenantId);

    @Update("UPDATE t_employee_advance SET " +
            "status = 'approved', " +
            "approver_id = #{approverId}, " +
            "approver_name = #{approverName}, " +
            "approval_time = NOW(), " +
            "approval_remark = #{remark}, " +
            "update_time = NOW() " +
            "WHERE id = #{id} AND tenant_id = #{tenantId} AND status = 'pending'")
    int atomicApprove(@Param("id") String id,
                      @Param("approverId") String approverId,
                      @Param("approverName") String approverName,
                      @Param("remark") String remark,
                      @Param("tenantId") Long tenantId);

    @Update("UPDATE t_employee_advance SET " +
            "status = 'rejected', " +
            "approver_id = #{approverId}, " +
            "approver_name = #{approverName}, " +
            "approval_time = NOW(), " +
            "approval_remark = #{remark}, " +
            "update_time = NOW() " +
            "WHERE id = #{id} AND tenant_id = #{tenantId} AND status = 'pending'")
    int atomicReject(@Param("id") String id,
                     @Param("approverId") String approverId,
                     @Param("approverName") String approverName,
                     @Param("remark") String remark,
                     @Param("tenantId") Long tenantId);
}
