package com.fashion.supplychain.finance.orchestration;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import com.fashion.supplychain.finance.service.FinishedProductSettlementService;
import com.fashion.supplychain.finance.service.FinishedSettlementApprovalStatusService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 成品结算编排层
 *
 * <p>负责结算单的取消、审批等写操作。
 * 所有写操作加 @Transactional(rollbackFor = Exception.class)。
 */
@Slf4j
@Service
public class SettlementOrchestrator {

    @Autowired
    private FinishedProductSettlementService settlementService;

    @Autowired
    private FinishedSettlementApprovalStatusService approvalStatusService;

    /**
     * 取消成品结算单
     *
     * <p>将状态设置为 "cancelled"，并更新 updateTime。
     * 注意：已取消的结算单不可再次取消。
     *
     * @param orderId 结算单orderId（主键）
     * @return true 成功，false 失败（不存在或已取消）
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean cancelSettlement(String orderId) {
        if (orderId == null || orderId.isBlank()) {
            return false;
        }
        FinishedProductSettlement settlement = settlementService.getById(orderId.trim());
        if (settlement == null) {
            return false;
        }
        String currentStatus = settlement.getStatus();
        if ("cancelled".equalsIgnoreCase(currentStatus) || "CANCELLED".equals(currentStatus)) {
            return false;
        }

        FinishedProductSettlement patch = new FinishedProductSettlement();
        patch.setOrderId(settlement.getOrderId());
        patch.setStatus("cancelled");
        patch.setUpdateTime(LocalDateTime.now());
        settlementService.updateById(patch);
        log.info("[SettlementOrchestrator] 成品结算单已取消: orderId={}", orderId);
        return true;
    }

    /**
     * 审批核实成品结算单
     *
     * @param orderId  结算单orderId（主键）
     * @param tenantId 租户ID
     * @param userId   审核人用户ID
     * @param username 审核人用户名
     * @return true 成功，false 失败
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean markApproved(String orderId, Long tenantId, String userId, String username) {
        if (orderId == null || orderId.isBlank()) {
            return false;
        }
        if (tenantId == null) {
            tenantId = TenantAssert.requireTenantId();
        }
        FinishedProductSettlement settlement = settlementService.getById(orderId);
        if (settlement == null) {
            return false;
        }
        Integer warehousedQty = settlement.getWarehousedQuantity();
        if (warehousedQty == null || warehousedQty <= 0) {
            return false;
        }
        approvalStatusService.markApproved(orderId, tenantId, userId, username);
        log.info("[SettlementOrchestrator] 结算单已审批: orderId={}, tenantId={}", orderId, tenantId);
        return true;
    }
}
