package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.common.UserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ProductionOrderOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderQueryService productionOrderQueryService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderProgressOrchestrationService progressOrchestrationService;

    @Autowired
    private ProductionOrderFinanceOrchestrationService financeOrchestrationService;

    @Autowired
    private ProductionOrderFlowOrchestrationService flowOrchestrationService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private ObjectMapper objectMapper;

    public IPage<ProductionOrder> queryPage(Map<String, Object> params) {
        return productionOrderQueryService.queryPage(params);
    }

    public ProductionOrder getDetailById(String id) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductionOrder order = productionOrderQueryService.getDetailById(oid);
        if (order == null) {
            throw new NoSuchElementException("生产订单不存在");
        }
        return order;
    }

    public boolean saveOrUpdateOrder(ProductionOrder productionOrder) {
        boolean isCreate = productionOrder != null && !StringUtils.hasText(productionOrder.getId());
        boolean ok = productionOrderService.saveOrUpdateOrder(productionOrder);
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }

        if (isCreate && productionOrder != null && StringUtils.hasText(productionOrder.getId())) {
            try {
                materialPurchaseService.generateDemandByOrderId(productionOrder.getId().trim(), false);
            } catch (Exception e) {
                String msg = e == null ? null : e.getMessage();
                if (msg != null && msg.contains("已生成采购需求")) {
                    return true;
                }
                log.warn("Failed to generate material demand after order create: orderId={}",
                        productionOrder.getId(),
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        productionOrder,
                        "generateMaterialDemand",
                        msg == null ? "generateMaterialDemand failed" : ("generateMaterialDemand failed: " + msg),
                        LocalDateTime.now());
            }
        }

        return true;
    }

    public boolean deleteById(String id) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        boolean ok = productionOrderService.deleteById(oid);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }
        return true;
    }

    public int recomputeProgressByStyleNo(String styleNo) {
        return progressOrchestrationService.recomputeProgressByStyleNo(styleNo);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateProductionProgress(String id, Integer progress, String rollbackRemark,
            String rollbackToProcessName) {
        return progressOrchestrationService.updateProductionProgress(id, progress, rollbackRemark,
                rollbackToProcessName);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateMaterialArrivalRate(String id, Integer rate) {
        return progressOrchestrationService.updateMaterialArrivalRate(id, rate);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean completeProduction(String id, BigDecimal tolerancePercent) {
        return financeOrchestrationService.completeProduction(id, tolerancePercent);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder closeOrder(String id) {
        return financeOrchestrationService.closeOrder(id);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean autoCloseOrderIfEligible(String id) {
        return financeOrchestrationService.autoCloseOrderIfEligible(id);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean ensureFinanceRecordsForOrder(String orderId) {
        return financeOrchestrationService.ensureFinanceRecordsForOrder(orderId);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean ensureShipmentReconciliationForOrder(String orderId) {
        return financeOrchestrationService.ensureShipmentReconciliationForOrder(orderId);
    }

    @Transactional(rollbackFor = Exception.class)
    public int backfillFinanceRecords() {
        return financeOrchestrationService.backfillFinanceRecords();
    }

    public Map<String, Object> getOrderFlow(String orderId) {
        return flowOrchestrationService.getOrderFlow(orderId);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder lockProgressWorkflow(String id, String workflowJson) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限操作进度节点");
        }

        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }

        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }

        String st = existed.getStatus() == null ? "" : existed.getStatus().trim();
        if ("completed".equalsIgnoreCase(st)) {
            throw new IllegalStateException("订单已完成，无法操作");
        }

        Integer locked = existed.getProgressWorkflowLocked();
        if (locked != null && locked == 1) {
            throw new IllegalStateException("流程已锁定");
        }

        String text = StringUtils.hasText(workflowJson) ? workflowJson.trim() : null;
        if (!StringUtils.hasText(text)) {
            throw new IllegalArgumentException("workflowJson不能为空");
        }

        String normalized = normalizeProgressWorkflowJson(text);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalStateException("流程内容为空或不合法");
        }

        LocalDateTime now = LocalDateTime.now();
        UserContext ctx = UserContext.get();
        String uid = ctx == null ? null : ctx.getUserId();
        String uname = ctx == null ? null : ctx.getUsername();

        String uidTrim = uid == null ? null : uid.trim();
        uidTrim = StringUtils.hasText(uidTrim) ? uidTrim : null;
        String unameTrim = uname == null ? null : uname.trim();
        unameTrim = StringUtils.hasText(unameTrim) ? unameTrim : null;

        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getProgressWorkflowJson, normalized)
                .set(ProductionOrder::getProgressWorkflowLocked, 1)
                .set(ProductionOrder::getProgressWorkflowLockedAt, now)
                .set(ProductionOrder::getProgressWorkflowLockedBy, uidTrim)
                .set(ProductionOrder::getProgressWorkflowLockedByName, unameTrim)
                .set(ProductionOrder::getUpdateTime, now)
                .update();
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        return getDetailById(oid);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder rollbackProgressWorkflow(String id) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }

        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }

        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }

        LocalDateTime now = LocalDateTime.now();
        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getProgressWorkflowLocked, 0)
                .set(ProductionOrder::getProgressWorkflowLockedAt, null)
                .set(ProductionOrder::getProgressWorkflowLockedBy, null)
                .set(ProductionOrder::getProgressWorkflowLockedByName, null)
                .set(ProductionOrder::getUpdateTime, now)
                .update();
        if (!ok) {
            throw new IllegalStateException("退回失败");
        }

        return getDetailById(oid);
    }

    private String normalizeProgressWorkflowJson(String raw) {
        String text = StringUtils.hasText(raw) ? raw.trim() : null;
        if (!StringUtils.hasText(text)) {
            return null;
        }

        try {
            com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(text);
            com.fasterxml.jackson.databind.JsonNode arr = root == null ? null : root.get("nodes");
            if (arr == null || !arr.isArray()) {
                return null;
            }

            List<Map<String, Object>> outNodes = new ArrayList<>();
            LinkedHashSet<String> seen = new LinkedHashSet<>();
            for (com.fasterxml.jackson.databind.JsonNode n : arr) {
                if (n == null) {
                    continue;
                }
                String name = n.hasNonNull("name") ? n.get("name").asText("") : "";
                name = StringUtils.hasText(name) ? name.trim() : "";
                if (!StringUtils.hasText(name)) {
                    continue;
                }
                String id = n.hasNonNull("id") ? n.get("id").asText("") : "";
                id = StringUtils.hasText(id) ? id.trim() : name;

                String idLower = id.trim().toLowerCase();
                if ("shipment".equals(idLower) || "出货".equals(name)) {
                    continue;
                }

                if (!seen.add(name)) {
                    continue;
                }

                java.math.BigDecimal unitPrice = java.math.BigDecimal.ZERO;
                if (n.hasNonNull("unitPrice")) {
                    com.fasterxml.jackson.databind.JsonNode v = n.get("unitPrice");
                    if (v != null) {
                        if (v.isNumber()) {
                            unitPrice = v.decimalValue();
                        } else {
                            try {
                                unitPrice = new java.math.BigDecimal(v.asText("0").trim());
                            } catch (Exception ignore) {
                                unitPrice = java.math.BigDecimal.ZERO;
                            }
                        }
                    }
                }
                if (unitPrice == null || unitPrice.compareTo(java.math.BigDecimal.ZERO) < 0) {
                    unitPrice = java.math.BigDecimal.ZERO;
                }

                outNodes.add(Map.of(
                        "id", id,
                        "name", name,
                        "unitPrice", unitPrice));
            }

            if (outNodes.isEmpty()) {
                return null;
            }

            return objectMapper.writeValueAsString(Map.of("nodes", outNodes));
        } catch (Exception e) {
            return null;
        }
    }
}
