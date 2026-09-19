package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.FinishedSettlementApprovalStatus;
import com.fashion.supplychain.finance.mapper.FinishedSettlementApprovalStatusMapper;
import com.fashion.supplychain.finance.service.FinishedSettlementApprovalStatusService;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 成品结算审批状态服务实现
 */
@Service
public class FinishedSettlementApprovalStatusServiceImpl
        extends ServiceImpl<FinishedSettlementApprovalStatusMapper, FinishedSettlementApprovalStatus>
        implements FinishedSettlementApprovalStatusService {

    @Override
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
            try {
                this.save(record);
            } catch (org.springframework.dao.DuplicateKeyException e) {
                // 并发幂等：批量审核时同一结算单的多行明细会并发调到本方法，
                // 两个请求同时查"不存在"再同时 INSERT，后到者撞 t_finished_settlement_approval 主键。
                // 冲突说明对方已写入审批记录，转为更新即可，不再向用户抛 409。
                FinishedSettlementApprovalStatus concurrent = this.getOne(wrapper, false);
                if (concurrent != null) {
                    concurrent.setStatus("approved");
                    concurrent.setApprovedById(approverId);
                    concurrent.setApprovedByName(approverName);
                    concurrent.setApprovedTime(now);
                    this.updateById(concurrent);
                }
            }
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

    @Override
    public Set<String> getApprovedIds(Long tenantId) {
        LambdaQueryWrapper<FinishedSettlementApprovalStatus> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(FinishedSettlementApprovalStatus::getStatus, "approved");
        if (tenantId != null) {
            wrapper.eq(FinishedSettlementApprovalStatus::getTenantId, tenantId);
        }
        return this.list(wrapper).stream()
                .map(FinishedSettlementApprovalStatus::getSettlementId)
                .filter(id -> id != null && !id.isEmpty())
                .collect(Collectors.toSet());
    }
}
