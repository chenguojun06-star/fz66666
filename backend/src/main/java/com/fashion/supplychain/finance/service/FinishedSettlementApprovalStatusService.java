package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.finance.entity.FinishedSettlementApprovalStatus;

/**
 * 成品结算审批状态服务
 */
public interface FinishedSettlementApprovalStatusService extends IService<FinishedSettlementApprovalStatus> {

    /**
     * 标记为已审批
     */
    void markApproved(String settlementId, Long tenantId, String approverId, String approverName);

    /**
     * 查询审批状态，不存在返回 pending
     */
    String getApprovalStatus(String settlementId, Long tenantId);
}
