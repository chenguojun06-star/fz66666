package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.EmployeeAdvance;
import com.fashion.supplychain.finance.mapper.EmployeeAdvanceMapper;
import com.fashion.supplychain.finance.service.EmployeeAdvanceService;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
public class EmployeeAdvanceServiceImpl extends ServiceImpl<EmployeeAdvanceMapper, EmployeeAdvance> implements EmployeeAdvanceService {

    @Override
    public int atomicRepay(String id, BigDecimal delta, BigDecimal expectedRepaymentAmount) {
        return baseMapper.atomicRepay(id, delta, expectedRepaymentAmount);
    }

    @Override
    public int atomicApprove(String id, String approverId, String approverName, String remark) {
        return baseMapper.atomicApprove(id, approverId, approverName, remark);
    }

    @Override
    public int atomicReject(String id, String approverId, String approverName, String remark) {
        return baseMapper.atomicReject(id, approverId, approverName, remark);
    }
}
