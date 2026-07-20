package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.helper.ProductionOrderLogAppendHelper;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 生产订单工序流程辅助器 — 锁定/回滚工序、确认采购、委外工序
 * 从 ProductionOrderOrchestrator 拆分，降低单文件行数
 */
@Service
@Slf4j
public class ProductionOrderWorkflowHelper {

    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private ProductionOrderQueryService productionOrderQueryService;
    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;
    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;
    @Autowired
    private ProductionOrderOrchestratorHelper helper;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private ProductionOrderLogAppendHelper logAppendHelper;
    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder lockProgressWorkflow(String id, String workflowJson) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) { throw new IllegalArgumentException("参数错误"); }

        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null) { throw new IllegalArgumentException("订单不存在"); }
        TenantAssert.assertBelongsToCurrentTenant(existed.getTenantId(), "生产订单");

        boolean isAdmin = false;
        try { isAdmin = UserContext.isSupervisorOrAbove(); } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
        if (!isAdmin) {
            throw new AccessDeniedException("仅主管及以上角色可锁定工序流程");
        }

        String text = StringUtils.hasText(workflowJson) ? workflowJson.trim() : null;
        if (StringUtils.hasText(text)) {
            text = helper.normalizeProgressWorkflowJson(text);
        }

        String userId = null;
        String userName = null;
        try { userId = UserContext.userId(); } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
        try { userName = UserContext.username(); } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }

        final String w = text;
        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getProgressWorkflowJson, w)
                .set(ProductionOrder::getProgressWorkflowLocked, 1)
                .set(ProductionOrder::getProgressWorkflowLockedAt, LocalDateTime.now())
                .set(ProductionOrder::getProgressWorkflowLockedBy, userId)
                .set(ProductionOrder::getProgressWorkflowLockedByName, userName)
                .set(ProductionOrder::getUpdateTime, LocalDateTime.now())
                .update();
        if (!ok) { throw new IllegalStateException("锁定失败"); }

        try {
            processTrackingOrchestrator.syncUnitPrices(oid);
        } catch (Exception e) {
            log.warn("lockProgressWorkflow: syncUnitPrices failed for orderId={}", oid, e);
        }

        // 同步工序跟踪记录（用户在工艺流程编辑器中新增/减少工序后，锁定时同步 tracking 表）
        // - 新增工序 → 为已有菲号补建缺失的 tracking 记录
        // - 减少工序 → 物理删除 pending 状态的多余 tracking（scanned 保留避免丢失工资数据）
        try {
            List<CuttingBundle> bundles = cuttingBundleService.lambdaQuery()
                    .eq(CuttingBundle::getProductionOrderId, oid)
                    .list();
            if (!bundles.isEmpty()) {
                int synced = processTrackingOrchestrator.appendProcessTracking(oid, bundles);
                log.info("[锁定工序] 同步工序跟踪记录: orderId={}, 补建 {} 条", oid, synced);
            }
        } catch (Exception e) {
            log.warn("[锁定工序] 同步工序跟踪记录失败（不阻断）: orderId={}, err={}", oid, e.getMessage());
        }

        // 写订单备注时间线：锁定工序流程
        try {
            logAppendHelper.appendLockWorkflow(oid, userName != null ? userName : UserContext.username());
        } catch (Exception e) {
            log.warn("[锁定工序] 写订单备注失败（不阻断）: orderId={}, err={}", oid, e.getMessage());
        }

        return productionOrderQueryService.getDetailById(oid);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder rollbackProgressWorkflow(String id, String reason) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) { throw new IllegalArgumentException("参数错误"); }

        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null) { throw new IllegalArgumentException("订单不存在"); }
        TenantAssert.assertBelongsToCurrentTenant(existed.getTenantId(), "生产订单");

        boolean isTop = false;
        try { isTop = UserContext.isTopAdmin(); } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
        if (!isTop) {
            throw new AccessDeniedException("仅最高管理员可回滚工序流程");
        }

        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getProgressWorkflowLocked, 0)
                .set(ProductionOrder::getProgressWorkflowLockedAt, null)
                .set(ProductionOrder::getProgressWorkflowLockedBy, null)
                .set(ProductionOrder::getProgressWorkflowLockedByName, null)
                .set(ProductionOrder::getUpdateTime, LocalDateTime.now())
                .update();
        if (!ok) { throw new IllegalStateException("回滚失败"); }

        try {
            scanRecordDomainService.insertRollbackRecord(existed, "流程回滚", reason, LocalDateTime.now());
        } catch (Exception e) {
            log.warn("rollbackProgressWorkflow: insertRollbackRecord failed for orderId={}", oid, e);
        }

        // 写订单备注时间线：回滚工序流程
        try {
            logAppendHelper.appendRollbackWorkflow(oid, reason);
        } catch (Exception e) {
            log.warn("[回滚工序] 写订单备注失败（不阻断）: orderId={}, err={}", oid, e.getMessage());
        }

        return productionOrderQueryService.getDetailById(oid);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder confirmProcurement(String orderId, String remark) {
        TenantAssert.assertTenantContext();
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) { throw new IllegalArgumentException("参数错误"); }

        if (StringUtils.hasText(remark) && remark.trim().length() < 10) {
            throw new IllegalArgumentException("备注至少10个字符");
        }

        ProductionOrder order = productionOrderQueryService.getDetailById(oid);
        if (order == null) {
            order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getOrderNo, oid)
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .last("LIMIT 1")
                    .one();
            if (order != null) {
                oid = order.getId();
            }
        }
        if (order == null) { throw new IllegalArgumentException("订单不存在"); }
        TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "生产订单");

        Integer arr = order.getMaterialArrivalRate();
        if (arr != null && arr < 50) {
            throw new IllegalStateException(
                    String.format("物料到货率不足50%%（当前%d%%），请确保物料到位后再确认采购", arr)
            );
        }

        String wfJson = order.getProgressWorkflowJson();
        if (StringUtils.hasText(wfJson)) {
            try {
                ObjectMapper localMapper = new ObjectMapper();
                Map<String, Object> workflow = localMapper.readValue(wfJson, new TypeReference<Map<String, Object>>() {});
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> stages = (List<Map<String, Object>>) workflow.get("stages");
                if (stages != null) {
                    for (Map<String, Object> stage : stages) {
                        if ("procurement".equals(stage.get("type")) || "采购".equals(stage.get("name"))) {
                            stage.put("status", "confirmed");
                            stage.put("confirmedAt", LocalDateTime.now().toString());
                            stage.put("confirmedBy", UserContext.username());
                            if (StringUtils.hasText(remark)) {
                                stage.put("remark", remark.trim());
                            }
                            break;
                        }
                    }
                    workflow.put("stages", stages);
                    String updatedJson = localMapper.writeValueAsString(workflow);
                    ProductionOrder updateEntity = new ProductionOrder();
                    updateEntity.setId(oid);
                    updateEntity.setProcurementManuallyCompleted(1);
                    updateEntity.setProcurementConfirmedBy(UserContext.userId());
                    updateEntity.setProcurementConfirmedByName(UserContext.username());
                    updateEntity.setProcurementConfirmedAt(LocalDateTime.now());
                    updateEntity.setProcurementConfirmRemark(remark.trim());
                    updateEntity.setProgressWorkflowJson(updatedJson);
                    updateEntity.setUpdateTime(LocalDateTime.now());
                    productionOrderService.updateById(updateEntity);
                }
            } catch (Exception e) {
                log.warn("confirmProcurement: update workflow JSON failed for orderId={}", oid, e);
            }
        } else {
            ProductionOrder updateEntity = new ProductionOrder();
            updateEntity.setId(oid);
            updateEntity.setProcurementManuallyCompleted(1);
            updateEntity.setProcurementConfirmedBy(UserContext.userId());
            updateEntity.setProcurementConfirmedByName(UserContext.username());
            updateEntity.setProcurementConfirmedAt(LocalDateTime.now());
            updateEntity.setProcurementConfirmRemark(remark.trim());
            updateEntity.setUpdateTime(LocalDateTime.now());
            productionOrderService.updateById(updateEntity);
        }

        // 写订单备注时间线：确认采购完成
        try {
            logAppendHelper.appendConfirmProcurement(oid, remark);
        } catch (Exception e) {
            log.warn("[确认采购] 写订单备注失败（不阻断）: orderId={}, err={}", oid, e.getMessage());
        }

        return productionOrderQueryService.getDetailById(oid);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> delegateProcess(String orderId, String processNode,
                                               String factoryId, Double unitPrice) {
        TenantAssert.assertTenantContext();
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) { throw new IllegalArgumentException("orderId不能为空"); }
        if (!StringUtils.hasText(processNode)) { throw new IllegalArgumentException("processNode不能为空"); }

        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null) { throw new IllegalArgumentException("订单不存在"); }
        TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "生产订单");

        String nodeName = helper.getProcessNodeName(processNode);
        String delegateNote = String.format("委外工序[%s] 工厂=%s 单价=%s 操作人=%s 时间=%s",
                nodeName,
                factoryId != null ? factoryId : "未指定",
                unitPrice != null ? unitPrice.toString() : "未指定",
                UserContext.username(),
                LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")));

        String wfJson = order.getProgressWorkflowJson();
        if (StringUtils.hasText(wfJson)) {
            try {
                Map<String, Object> workflow = objectMapper.readValue(wfJson, new TypeReference<Map<String, Object>>() {});
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> stages = (List<Map<String, Object>>) workflow.get("stages");
                if (stages != null) {
                    for (Map<String, Object> stage : stages) {
                        if (processNode.equals(stage.get("name")) || processNode.equals(stage.get("key"))) {
                            stage.put("delegated", true);
                            stage.put("delegateFactoryId", factoryId);
                            stage.put("delegateUnitPrice", unitPrice);
                            stage.put("delegateNote", delegateNote);
                            break;
                        }
                    }
                    workflow.put("stages", stages);
                    ProductionOrder u = new ProductionOrder();
                    u.setId(oid);
                    try {
                        u.setProgressWorkflowJson(objectMapper.writeValueAsString(workflow));
                    } catch (Exception ex) {
                        u.setProgressWorkflowJson("{\"stages\":" + wfJson + ",\"delegateNote\":\"" +
                                delegateNote.replace("\"", "'") + "\"}");
                    }
                    u.setUpdateTime(LocalDateTime.now());
                    productionOrderService.updateById(u);
                }
            } catch (Exception e) {
                log.warn("delegateProcess: parse/update workflow failed for orderId={}", oid, e);
            }
        }

        // 写订单备注时间线：工序委派
        try {
            logAppendHelper.appendDelegateProcess(oid, delegateNote);
        } catch (Exception e) {
            log.warn("[工序委派] 写订单备注失败（不阻断）: orderId={}, err={}", oid, e.getMessage());
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("orderId", oid);
        result.put("processNode", processNode);
        result.put("delegateNote", delegateNote);
        return result;
    }
}
