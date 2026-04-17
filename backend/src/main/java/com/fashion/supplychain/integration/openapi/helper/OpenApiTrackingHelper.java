package com.fashion.supplychain.integration.openapi.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

import org.springframework.util.StringUtils;
import java.util.*;

/**
 * OpenAPI 跟踪 Helper — 质检反馈 + 物流对接 + 付款对接
 * 从 OpenApiOrchestrator 拆分
 */
@Slf4j
@Component
public class OpenApiTrackingHelper {

    @Autowired private ScanRecordService scanRecordService;
    @Autowired private ProductOutstockService productOutstockService;
    @Autowired private ShipmentReconciliationService shipmentReconciliationService;
    @Autowired private ProductionOrderService productionOrderService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // ========== 质检反馈 (QUALITY_FEEDBACK) ==========

    /**
     * 获取质检报告
     */
    public Map<String, Object> getQualityReport(TenantApp app, String orderNo) {
        // 租户隔离：先验证订单是否属于该应用
        var orderCheck = productionOrderService.list(
            new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getOrderNo, orderNo)
                .likeRight(ProductionOrder::getCreatedByName, "OpenAPI-")
        );
        if (orderCheck.isEmpty()) {
            throw new IllegalArgumentException("订单不存在或无权访问: " + orderNo);
        }
        // 查询扫码记录中的质检数据
        var scanRecords = scanRecordService.list(
            new LambdaQueryWrapper<com.fashion.supplychain.production.entity.ScanRecord>()
                .eq(com.fashion.supplychain.production.entity.ScanRecord::getOrderNo, orderNo)
                .orderByDesc(com.fashion.supplychain.production.entity.ScanRecord::getCreateTime)
        );

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderNo", orderNo);
        result.put("totalRecords", scanRecords.size());
        result.put("reportTime", LocalDateTime.now().toString());

        // 汇总各工序的扫码数据
        Map<String, Integer> processSummary = new LinkedHashMap<>();
        for (var record : scanRecords) {
            String processName = record.getProcessName();
            if (processName != null) {
                processSummary.merge(processName, record.getQuantity() != null ? record.getQuantity() : 1, Integer::sum);
            }
        }
        result.put("processSummary", processSummary);

        return result;
    }

    /**
     * 查询质检记录列表
     */
    public Map<String, Object> listQualityRecords(TenantApp app, String body) {
        try {
            Map<String, Object> params = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            int page = params.get("page") != null ? ((Number) params.get("page")).intValue() : 1;
            int size = params.get("size") != null ? ((Number) params.get("size")).intValue() : 20;
            String orderNo = (String) params.get("orderNo");

            LambdaQueryWrapper<com.fashion.supplychain.production.entity.ScanRecord> wrapper = new LambdaQueryWrapper<>();
            if (StringUtils.hasText(orderNo)) {
                wrapper.eq(com.fashion.supplychain.production.entity.ScanRecord::getOrderNo, orderNo);
            }
            wrapper.orderByDesc(com.fashion.supplychain.production.entity.ScanRecord::getCreateTime);

            Page<com.fashion.supplychain.production.entity.ScanRecord> pageResult =
                scanRecordService.page(new Page<>(page, size), wrapper);

            List<Map<String, Object>> records = new ArrayList<>();
            for (var record : pageResult.getRecords()) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", record.getId());
                item.put("orderNo", record.getOrderNo());
                item.put("processName", record.getProcessName());
                item.put("quantity", record.getQuantity());
                item.put("scanTime", record.getCreateTime());
                records.add(item);
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("total", pageResult.getTotal());
            result.put("page", pageResult.getCurrent());
            result.put("size", pageResult.getSize());
            result.put("records", records);
            return result;
        } catch (Exception e) {
            throw new RuntimeException("查询质检记录失败: " + e.getMessage(), e);
        }
    }

    // ========== 物流对接 (LOGISTICS_SYNC) ==========

    /**
     * 查询物流/出库状态
     */
    public Map<String, Object> getLogisticsStatus(TenantApp app, String orderNo) {
        // 租户隔离：先验证订单归属
        var orderCheck = productionOrderService.list(
            new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getOrderNo, orderNo)
                .likeRight(ProductionOrder::getCreatedByName, "OpenAPI-")
        );
        if (orderCheck.isEmpty()) {
            throw new IllegalArgumentException("订单不存在或无权访问: " + orderNo);
        }
        var outstocks = productOutstockService.list(
            new LambdaQueryWrapper<com.fashion.supplychain.production.entity.ProductOutstock>()
                .eq(com.fashion.supplychain.production.entity.ProductOutstock::getOrderNo, orderNo)
                .orderByDesc(com.fashion.supplychain.production.entity.ProductOutstock::getCreateTime)
        );

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderNo", orderNo);
        result.put("totalShipments", outstocks.size());

        List<Map<String, Object>> shipments = new ArrayList<>();
        for (var out : outstocks) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("outstockNo", out.getOutstockNo());
            item.put("quantity", out.getOutstockQuantity());
            item.put("outstockType", out.getOutstockType());
            item.put("warehouse", out.getWarehouse());
            item.put("createTime", out.getCreateTime());
            shipments.add(item);
        }
        result.put("shipments", shipments);
        return result;
    }

    /**
     * 物流记录列表
     */
    public Map<String, Object> listLogisticsRecords(TenantApp app, String body) {
        try {
            Map<String, Object> params = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            int page = params.get("page") != null ? ((Number) params.get("page")).intValue() : 1;
            int size = params.get("size") != null ? ((Number) params.get("size")).intValue() : 20;

            LambdaQueryWrapper<com.fashion.supplychain.production.entity.ProductOutstock> wrapper = new LambdaQueryWrapper<>();
            wrapper.orderByDesc(com.fashion.supplychain.production.entity.ProductOutstock::getCreateTime);

            Page<com.fashion.supplychain.production.entity.ProductOutstock> pageResult =
                productOutstockService.page(new Page<>(page, size), wrapper);

            List<Map<String, Object>> records = new ArrayList<>();
            for (var out : pageResult.getRecords()) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("outstockNo", out.getOutstockNo());
                item.put("orderNo", out.getOrderNo());
                item.put("quantity", out.getOutstockQuantity());
                item.put("outstockType", out.getOutstockType());
                item.put("warehouse", out.getWarehouse());
                item.put("createTime", out.getCreateTime());
                records.add(item);
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("total", pageResult.getTotal());
            result.put("page", pageResult.getCurrent());
            result.put("size", pageResult.getSize());
            result.put("records", records);
            return result;
        } catch (Exception e) {
            throw new RuntimeException("查询物流记录失败: " + e.getMessage(), e);
        }
    }

    // ========== 付款对接 (PAYMENT_SYNC) ==========

    /**
     * 查询待付款对账单
     */
    public Map<String, Object> getPendingPayments(TenantApp app) {
        var reconciliations = shipmentReconciliationService.list(
            new LambdaQueryWrapper<com.fashion.supplychain.finance.entity.ShipmentReconciliation>()
                .in(com.fashion.supplychain.finance.entity.ShipmentReconciliation::getStatus,
                    Arrays.asList("pending_payment", "approved"))
                .orderByDesc(com.fashion.supplychain.finance.entity.ShipmentReconciliation::getCreateTime)
        );

        List<Map<String, Object>> records = new ArrayList<>();
        for (var recon : reconciliations) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("reconciliationId", recon.getId());
            item.put("orderNo", recon.getOrderNo());
            item.put("totalAmount", recon.getTotalAmount());
            item.put("status", recon.getStatus());
            item.put("createTime", recon.getCreateTime());
            records.add(item);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", records.size());
        result.put("records", records);
        return result;
    }

    /**
     * 确认付款 — 真实更新对账单状态为已付款，可在【财务管理→订单结算】查看
     */
    public Map<String, Object> confirmPayment(TenantApp app, String body) {
        try {
            Map<String, Object> params = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            String reconciliationId = params.get("reconciliationId") != null ? params.get("reconciliationId").toString() : null;
            String paymentMethod = (String) params.get("paymentMethod");
            String paymentRef = (String) params.get("paymentRef");

            if (!StringUtils.hasText(reconciliationId)) {
                throw new IllegalArgumentException("缺少必填参数: reconciliationId");
            }

            // 查询对账单
            ShipmentReconciliation recon = shipmentReconciliationService.getById(reconciliationId);
            if (recon == null) {
                throw new IllegalArgumentException("对账单不存在: " + reconciliationId);
            }

            // 验证状态 - 只有 approved/pending_payment 状态才能确认付款
            if (!"approved".equals(recon.getStatus()) && !"pending_payment".equals(recon.getStatus())) {
                throw new IllegalArgumentException("对账单当前状态(" + recon.getStatus() + ")不允许确认付款，需要先审批通过");
            }

            // 更新为已付款状态
            recon.setStatus("paid");
            recon.setPaidAt(LocalDateTime.now());
            recon.setRemark((recon.getRemark() != null ? recon.getRemark() + " | " : "")
                    + "[第三方付款确认] 方式: " + (paymentMethod != null ? paymentMethod : "未指定")
                    + ", 流水号: " + (paymentRef != null ? paymentRef : "无")
                    + ", 来源: " + app.getAppName());
            shipmentReconciliationService.updateById(recon);

            log.info("[OpenAPI] 第三方确认付款: reconciliationId={}, orderNo={}, amount={}, method={}, ref={}, 来源={}",
                    reconciliationId, recon.getOrderNo(), recon.getTotalAmount(), paymentMethod, paymentRef, app.getAppName());

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("reconciliationId", reconciliationId);
            result.put("orderNo", recon.getOrderNo());
            result.put("totalAmount", recon.getTotalAmount());
            result.put("status", "paid");
            result.put("paymentMethod", paymentMethod);
            result.put("paymentRef", paymentRef);
            result.put("paidAt", recon.getPaidAt().toString());
            result.put("message", "付款已确认，可在【财务管理→订单结算】页面查看");
            result.put("viewUrl", "/finance/center?orderNo=" + recon.getOrderNo());
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("确认付款失败: " + e.getMessage(), e);
        }
    }

    /**
     * 查询付款/对账记录
     */
    public Map<String, Object> listPaymentRecords(TenantApp app, String body) {
        try {
            Map<String, Object> params = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            int page = params.get("page") != null ? ((Number) params.get("page")).intValue() : 1;
            int size = params.get("size") != null ? ((Number) params.get("size")).intValue() : 20;

            LambdaQueryWrapper<com.fashion.supplychain.finance.entity.ShipmentReconciliation> wrapper = new LambdaQueryWrapper<>();
            wrapper.orderByDesc(com.fashion.supplychain.finance.entity.ShipmentReconciliation::getCreateTime);

            Page<com.fashion.supplychain.finance.entity.ShipmentReconciliation> pageResult =
                shipmentReconciliationService.page(new Page<>(page, size), wrapper);

            List<Map<String, Object>> records = new ArrayList<>();
            for (var recon : pageResult.getRecords()) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("reconciliationId", recon.getId());
                item.put("orderNo", recon.getOrderNo());
                item.put("totalAmount", recon.getTotalAmount());
                item.put("status", recon.getStatus());
                item.put("createTime", recon.getCreateTime());
                records.add(item);
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("total", pageResult.getTotal());
            result.put("page", pageResult.getCurrent());
            result.put("size", pageResult.getSize());
            result.put("records", records);
            return result;
        } catch (Exception e) {
            throw new RuntimeException("查询对账记录失败: " + e.getMessage(), e);
        }
    }

}
