package com.fashion.supplychain.integration.openapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.integration.openapi.orchestration.TenantAppOrchestrator;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Webhook 推送服务
 * 负责在业务事件发生时，主动推送数据到客户系统的回调地址
 *
 * 支持的事件：
 * - quality.inspected: 质检完成 → 推送到 QUALITY_FEEDBACK 类型的应用回调地址
 * - logistics.shipped: 出库发货 → 推送到 LOGISTICS_SYNC 类型的应用回调地址
 * - order.status_changed: 订单状态变更 → 推送到 ORDER_SYNC 类型的应用回调地址
 * - payment.reconciled: 对账单生成 → 推送到 PAYMENT_SYNC 类型的应用回调地址
 *
 * 查看推送记录：【客户应用管理】→ 选择应用 → 查看调用日志（direction=OUTBOUND）
 */
@Slf4j
@Service
public class WebhookPushService {

    @Autowired
    private TenantAppService tenantAppService;

    @Autowired
    private TenantAppOrchestrator tenantAppOrchestrator;

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 质检完成推送 — 推送到所有 QUALITY_FEEDBACK 类型的活跃应用
     * 触发时机：质检入库完成后调用
     * 客户在哪里看：客户系统收到 Webhook 回调；我方系统在【客户应用管理→调用日志】查看推送记录
     *
     * @param orderNo 订单号
     * @param processName 工序名称
     * @param qualifiedQty 合格数量
     * @param unqualifiedQty 不合格数量
     * @param details 附加详情
     */
    @Async
    public void pushQualityResult(String orderNo, String processName,
                                  int qualifiedQty, int unqualifiedQty,
                                  Map<String, Object> details) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("event", "quality.inspected");
        payload.put("orderNo", orderNo);
        payload.put("processName", processName);
        payload.put("qualifiedQuantity", qualifiedQty);
        payload.put("unqualifiedQuantity", unqualifiedQty);
        payload.put("inspectedAt", LocalDateTime.now().toString());
        if (details != null) {
            payload.putAll(details);
        }

        pushToAppsByType("QUALITY_FEEDBACK", payload);
    }

    /**
     * 出库发货推送 — 推送到所有 LOGISTICS_SYNC 类型的活跃应用
     * 触发时机：成品出库完成后调用
     * 客户在哪里看：客户系统收到 Webhook 回调；我方系统在【客户应用管理→调用日志】查看推送记录
     *
     * @param orderNo 订单号
     * @param outstockNo 出库单号
     * @param quantity 出库数量
     * @param warehouse 发货仓库
     * @param details 附加详情（物流单号等）
     */
    @Async
    public void pushLogisticsUpdate(String orderNo, String outstockNo,
                                    int quantity, String warehouse,
                                    Map<String, Object> details) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("event", "logistics.shipped");
        payload.put("orderNo", orderNo);
        payload.put("outstockNo", outstockNo);
        payload.put("quantity", quantity);
        payload.put("warehouse", warehouse);
        payload.put("shippedAt", LocalDateTime.now().toString());
        if (details != null) {
            payload.putAll(details);
        }

        pushToAppsByType("LOGISTICS_SYNC", payload);
    }

    /**
     * 订单状态变更推送 — 推送到所有 ORDER_SYNC 类型的活跃应用
     * 触发时机：订单状态发生变化时调用
     * 客户在哪里看：客户系统收到 Webhook 回调；我方在【客户应用管理→调用日志】查看
     */
    @Async
    public void pushOrderStatusChange(String orderNo, String oldStatus, String newStatus,
                                      Map<String, Object> details) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("event", "order.status_changed");
        payload.put("orderNo", orderNo);
        payload.put("oldStatus", oldStatus);
        payload.put("newStatus", newStatus);
        payload.put("changedAt", LocalDateTime.now().toString());
        if (details != null) {
            payload.putAll(details);
        }

        pushToAppsByType("ORDER_SYNC", payload);
    }

    /**
     * 对账单推送 — 推送到所有 PAYMENT_SYNC 类型的活跃应用
     * 触发时机：对账单审批通过后调用
     * 客户在哪里看：客户系统收到 Webhook 回调；我方在【财务管理→订单结算】查看
     */
    @Async
    public void pushReconciliationCreated(String orderNo, String reconciliationId,
                                          java.math.BigDecimal totalAmount,
                                          Map<String, Object> details) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("event", "payment.reconciliation_ready");
        payload.put("orderNo", orderNo);
        payload.put("reconciliationId", reconciliationId);
        payload.put("totalAmount", totalAmount);
        payload.put("status", "pending_payment");
        payload.put("createdAt", LocalDateTime.now().toString());
        payload.put("confirmUrl", "/openapi/v1/payment/confirm");
        if (details != null) {
            payload.putAll(details);
        }

        pushToAppsByType("PAYMENT_SYNC", payload);
    }

    // ========== 内部推送逻辑 ==========

    /**
     * 按应用类型推送给所有活跃应用
     */
    private void pushToAppsByType(String appType, Map<String, Object> payload) {
        try {
            // 查询所有该类型的活跃应用
            LambdaQueryWrapper<TenantApp> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(TenantApp::getAppType, appType);
            wrapper.eq(TenantApp::getStatus, "active");
            wrapper.eq(TenantApp::getDeleteFlag, 0);
            wrapper.isNotNull(TenantApp::getCallbackUrl);
            List<TenantApp> apps = tenantAppService.list(wrapper);

            if (apps.isEmpty()) {
                log.debug("[Webhook] 无活跃的 {} 类型应用，跳过推送", appType);
                return;
            }

            for (TenantApp app : apps) {
                if (!StringUtils.hasText(app.getCallbackUrl())) {
                    continue;
                }
                pushToSingleApp(app, payload);
            }
        } catch (Exception e) {
            log.error("[Webhook] 推送失败 type={}: {}", appType, e.getMessage());
        }
    }

    /**
     * 推送到单个应用（带签名 + 重试）
     */
    private void pushToSingleApp(TenantApp app, Map<String, Object> payload) {
        long start = System.currentTimeMillis();
        String responseBody = null;
        int responseCode = 0;
        String result = "SUCCESS";
        String errorMessage = null;

        try {
            String jsonBody = objectMapper.writeValueAsString(payload);
            String timestamp = String.valueOf(System.currentTimeMillis() / 1000);

            // 构建请求头（带签名）
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Webhook-Event", (String) payload.get("event"));
            headers.set("X-Timestamp", timestamp);
            headers.set("X-App-Key", app.getAppKey());

            // 使用 callbackSecret 签名
            if (StringUtils.hasText(app.getCallbackSecret())) {
                String signature = hmacSha256(app.getCallbackSecret(), timestamp + jsonBody);
                headers.set("X-Signature", signature);
            }

            HttpEntity<String> entity = new HttpEntity<>(jsonBody, headers);

            // 发送请求（3秒超时）
            ResponseEntity<String> response = restTemplate.exchange(
                    app.getCallbackUrl(), HttpMethod.POST, entity, String.class);

            responseCode = response.getStatusCode().value();
            responseBody = response.getBody();

            if (!response.getStatusCode().is2xxSuccessful()) {
                result = "FAILED";
                errorMessage = "HTTP " + responseCode;
            }

            log.info("[Webhook] 推送成功: app={}, event={}, url={}, status={}",
                    app.getAppName(), payload.get("event"), app.getCallbackUrl(), responseCode);

        } catch (Exception e) {
            result = "ERROR";
            responseCode = 0;
            errorMessage = e.getMessage();
            log.warn("[Webhook] 推送失败: app={}, event={}, url={}, error={}",
                    app.getAppName(), payload.get("event"), app.getCallbackUrl(), e.getMessage());
        }

        // 记录推送日志（direction=OUTBOUND）
        long costMs = System.currentTimeMillis() - start;
        try {
            String requestBody = objectMapper.writeValueAsString(payload);
            tenantAppOrchestrator.logApiCall(
                    app.getId(), app.getTenantId(), app.getAppType(),
                    "OUTBOUND", "POST", app.getCallbackUrl(),
                    requestBody, responseCode, responseBody, costMs,
                    result, errorMessage, "SYSTEM");
        } catch (Exception ignored) {
            // 日志记录失败不影响主流程
        }
    }

    private String hmacSha256(String secret, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] bytes = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException("签名计算失败", e);
        }
    }
}
