package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.FinishedSettlementApprovalStatus;
import com.fashion.supplychain.finance.mapper.FinishedSettlementApprovalStatusMapper;
import com.fashion.supplychain.finance.service.FinishedSettlementApprovalStatusService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 成品结算审批状态服务实现
 */
@Service
public class FinishedSettlementApprovalStatusServiceImpl
        extends ServiceImpl<FinishedSettlementApprovalStatusMapper, FinishedSettlementApprovalStatus>
        implements FinishedSettlementApprovalStatusService {

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void markApproved(String settlementId, Long tenantId, String approverId, String approverName) {
        LambdaQueryWrapper<FinishedSettlementApprovalStatus> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(FinishedSettlementApprovalStatus::getSettlementId, settlementId);
        if (tenantId != null) {
            wrapper.eq(FinishedSettlementApprovalStatus::getTenantId, tenantId);
        }

        FinishedSettlementApprovalStatus existed = this.getOne(wrapper, false);
        LocalDateTime now = LocalDateTime.now();

        if (existed == null) {
            FinishedSettlementApprovalStatus record = new FinishedSettlementApprovalStatus();
            record.setSettlementId(settlementId);
            record.setStatus("approved");
            record.setApprovedById(approverId);
            record.setApprovedByName(approverName);
            record.setApprovedTime(now);
            record.setTenantId(tenantId);
            this.save(record);
            return;
        }

        existed.setStatus("approved");
        existed.setApprovedById(approverId);
        existed.setApprovedByName(approverName);
        existed.setApprovedTime(now);
        this.updateById(existed);
    }

    @Override
    public String getApprovalStatus(String settlementId, Long tenantId) {
        LambdaQueryWrapper<FinishedSettlementApprovalStatus> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(FinishedSettlementApprovalStatus::getSettlementId, settlementId);
        if (tenantId != null) {
            wrapper.eq(FinishedSettlementApprovalStatus::getTenantId, tenantId);
        }

        FinishedSettlementApprovalStatus record = this.getOne(wrapper, false);
        if (record == null || record.getStatus() == null) {
            return "pending";
        }
        return record.getStatus();
    }
}
