package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class OrderWorkflowHelper {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderQueryService productionOrderQueryService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

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

        // 同步工序单价到工序跟踪表（修复单价不同步问题）
        try {
            int synced = processTrackingOrchestrator.syncUnitPrices(oid);
            if (synced > 0) {
                log.info("锁定进度工作流时已同步{}条工序跟踪记录的单价", synced);
            }
        } catch (Exception e) {
            // 同步失败不影响主流程，记录日志
            log.warn("同步工序跟踪单价失败: {}", e.getMessage());
        }

        return productionOrderQueryService.getDetailById(oid);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder rollbackProgressWorkflow(String id, String reason) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }

        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }

        String remark = StringUtils.hasText(reason) ? reason.trim() : null;
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("reason不能为空");
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
        try {
            scanRecordDomainService.insertRollbackRecord(existed, "流程退回", remark, now);
        } catch (Exception e) {
            log.warn("Failed to log workflow rollback: orderId={}", oid, e);
        }

        return productionOrderQueryService.getDetailById(oid);
    }

    public String normalizeProgressWorkflowJson(String raw) {
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
                if ("shipment".equals(idLower) || "出货".equals(name) || "发货".equals(name) || "发运".equals(name)) {
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

    /**
     * 手动确认采购完成（允许50%物料差异）
     * 业务规则：
     * - materialArrivalRate < 50%: 不允许确认，必须继续采购
     * - materialArrivalRate >= 50%: 允许人工确认"回料完成"，需填写备注原因（即使100%也需要人工确认）
     *
     * @param orderId 订单ID
     * @param remark 确认备注（说明物料到货情况和确认原因）
     * @return 更新后的订单
     */
    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder confirmProcurement(String orderId, String remark) {
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        if (!StringUtils.hasText(remark) || remark.trim().length() < 10) {
            throw new IllegalArgumentException("确认备注至少需要10个字符，请详细说明确认原因");
        }

        // 获取订单详情（包含物料到货率）
        ProductionOrder order = productionOrderQueryService.getDetailById(orderId);
        if (order == null) {
            throw new NoSuchElementException("订单不存在: " + orderId);
        }

        // 验证物料到货率
        Integer materialArrivalRate = order.getMaterialArrivalRate();
        if (materialArrivalRate == null) {
            materialArrivalRate = 0;
        }

        // 物料到货率<50%：不允许确认
        if (materialArrivalRate < 50) {
            throw new IllegalStateException(
                String.format("物料到货率不足50%%（当前%d%%），不允许确认采购完成，请继续采购",
                    materialArrivalRate)
            );
        }

        // 已经确认过了
        Integer manuallyCompleted = order.getProcurementManuallyCompleted();
        if (manuallyCompleted != null && manuallyCompleted == 1) {
            throw new IllegalStateException("该订单采购已确认完成，无需重复确认");
        }

        // 更新确认信息
        LocalDateTime now = LocalDateTime.now();
        String userId = UserContext.userId();
        String username = UserContext.username();

        ProductionOrder updateEntity = new ProductionOrder();
        updateEntity.setId(orderId);
        updateEntity.setProcurementManuallyCompleted(1);
        updateEntity.setProcurementConfirmedBy(userId);
        updateEntity.setProcurementConfirmedByName(username);
        updateEntity.setProcurementConfirmedAt(now);
        updateEntity.setProcurementConfirmRemark(remark.trim());

        // 计算采购完成后的进度（采购是第1个节点）
        try {
            String workflowJson = order.getProgressWorkflowJson();
            if (StringUtils.hasText(workflowJson)) {
                ObjectMapper mapper = new ObjectMapper();
                Map<String, Object> workflow = mapper.readValue(workflowJson, new TypeReference<Map<String, Object>>() {});
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> nodes = (List<Map<String, Object>>) workflow.get("nodes");

                if (nodes != null && !nodes.isEmpty()) {
                    int totalNodes = nodes.size();
                    // 采购完成 = 第1个节点完成 = 1/N * 100
                    int progress = (int) Math.round(100.0 / totalNodes);
                    updateEntity.setProductionProgress(progress);
                    log.info("Order procurement confirmed - updating progress: orderId={}, totalNodes={}, progress={}%",
                            orderId, totalNodes, progress);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to calculate procurement progress: orderId={}", orderId, e);
            // 即使计算失败也继续，不阻断采购确认流程
        }

        boolean updated = productionOrderService.updateById(updateEntity);
        if (!updated) {
            throw new RuntimeException("更新采购确认信息失败");
        }

        log.info("Order procurement manually confirmed: orderId={}, materialArrivalRate={}%, confirmedBy={}, remark={}",
                orderId, materialArrivalRate, username, remark);

        // 记录扫码日志（用于追踪）
        try {
            scanRecordDomainService.insertRollbackRecord(
                order,
                "采购手动确认",
                String.format("物料到货率%d%%，确认人：%s，备注：%s", materialArrivalRate, username, remark),
                now
            );
        } catch (Exception e) {
            log.warn("Failed to log procurement confirmation: orderId={}", orderId, e);
        }

        // 返回更新后的完整订单信息
        return productionOrderQueryService.getDetailById(orderId);
    }
}
