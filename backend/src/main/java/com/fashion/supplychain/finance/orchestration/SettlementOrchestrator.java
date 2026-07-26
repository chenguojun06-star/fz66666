package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
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
        // P0 修复（铁律4 多租户隔离）：必须按 tenantId 过滤查询，禁止 getById 绕过租户校验
        Long tenantId = TenantAssert.requireTenantId();
        FinishedProductSettlement settlement = settlementService.lambdaQuery()
                .eq(FinishedProductSettlement::getOrderId, orderId.trim())
                .eq(FinishedProductSettlement::getTenantId, tenantId)
                .one();
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
     * <p>P0 修复（铁律4 多租户隔离）：tenantId 强制从 UserContext 获取，
     * 禁止外部传入绕过租户上下文。
     *
     * @param orderId  结算单orderId（主键）
     * @param userId   审核人用户ID
     * @param username 审核人用户名
     * @return true 成功，false 失败
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean markApproved(String orderId, String userId, String username) {
        if (orderId == null || orderId.isBlank()) {
            return false;
        }
        // P0 修复：强制从 UserContext 获取 tenantId，禁止外部传入
        Long tenantId = TenantAssert.requireTenantId();
        // P0 修复：必须按 tenantId 过滤查询
        FinishedProductSettlement settlement = settlementService.lambdaQuery()
                .eq(FinishedProductSettlement::getOrderId, orderId)
                .eq(FinishedProductSettlement::getTenantId, tenantId)
                .one();
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
