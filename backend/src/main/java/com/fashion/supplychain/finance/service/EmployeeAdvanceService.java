package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.finance.entity.EmployeeAdvance;

import java.math.BigDecimal;

public interface EmployeeAdvanceService extends IService<EmployeeAdvance> {
    int atomicRepay(String id, BigDecimal delta, BigDecimal expectedRepaymentAmount);
    int atomicApprove(String id, String approverId, String approverName, String remark);
    int atomicReject(String id, String approverId, String approverName, String remark);
}
