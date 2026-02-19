package com.fashion.supplychain.integration.openapi.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.integration.openapi.orchestration.OpenApiOrchestrator;
import com.fashion.supplychain.integration.openapi.orchestration.TenantAppOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.Map;

/**
 * 开放API入口 - 客户系统调用的统一入口
 *
 * 鉴权方式：Header 签名
 *   X-App-Key: appKey
 *   X-Timestamp: 当前时间戳(秒)
 *   X-Signature: HMAC-SHA256(appSecret, timestamp + requestBody)
 *
 * 免Spring Security拦截（需在SecurityConfig中放行 /openapi/** 路径）
 */
@RestController
@RequestMapping("/openapi/v1")
public class OpenApiController {

    @Autowired
    private TenantAppOrchestrator tenantAppOrchestrator;

    @Autowired
    private OpenApiOrchestrator openApiOrchestrator;

    // ========== 下单对接 (ORDER_SYNC) ==========

    /**
     * 客户提交生产订单
     */
    @PostMapping("/order/create")
    public Result<Map<String, Object>> createOrder(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppType(app, "ORDER_SYNC");
            Map<String, Object> result = openApiOrchestrator.createExternalOrder(app, body);
            logSuccess(app, "POST", "/openapi/v1/order/create", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/order/create", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 客户查询订单状态
     */
    @GetMapping("/order/status/{orderNo}")
    public Result<Map<String, Object>> getOrderStatus(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @PathVariable String orderNo,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, "");
            validateAppType(app, "ORDER_SYNC");
            Map<String, Object> result = openApiOrchestrator.getOrderStatus(app, orderNo);
            logSuccess(app, "GET", "/openapi/v1/order/status/" + orderNo, null, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "GET", "/openapi/v1/order/status/" + orderNo, null, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 客户查询订单列表
     */
    @PostMapping("/order/list")
    public Result<Map<String, Object>> listOrders(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppType(app, "ORDER_SYNC");
            Map<String, Object> result = openApiOrchestrator.listExternalOrders(app, body);
            logSuccess(app, "POST", "/openapi/v1/order/list", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/order/list", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 客户批量上传订单（适合初始化导入）
     */
    @PostMapping("/order/upload")
    public Result<Map<String, Object>> uploadOrders(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppType(app, "ORDER_SYNC");
            Map<String, Object> result = openApiOrchestrator.batchCreateExternalOrders(app, body);
            logSuccess(app, "POST", "/openapi/v1/order/upload", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/order/upload", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    // ========== 质检反馈 (QUALITY_FEEDBACK) ==========

    /**
     * 查询质检报告
     */
    @GetMapping("/quality/report/{orderNo}")
    public Result<Map<String, Object>> getQualityReport(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @PathVariable String orderNo,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, "");
            validateAppType(app, "QUALITY_FEEDBACK");
            Map<String, Object> result = openApiOrchestrator.getQualityReport(app, orderNo);
            logSuccess(app, "GET", "/openapi/v1/quality/report/" + orderNo, null, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "GET", "/openapi/v1/quality/report/" + orderNo, null, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 质检结果列表
     */
    @PostMapping("/quality/list")
    public Result<Map<String, Object>> listQualityRecords(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppType(app, "QUALITY_FEEDBACK");
            Map<String, Object> result = openApiOrchestrator.listQualityRecords(app, body);
            logSuccess(app, "POST", "/openapi/v1/quality/list", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/quality/list", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    // ========== 物流对接 (LOGISTICS_SYNC) ==========

    /**
     * 查询物流/出库状态
     */
    @GetMapping("/logistics/status/{orderNo}")
    public Result<Map<String, Object>> getLogisticsStatus(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @PathVariable String orderNo,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, "");
            validateAppType(app, "LOGISTICS_SYNC");
            Map<String, Object> result = openApiOrchestrator.getLogisticsStatus(app, orderNo);
            logSuccess(app, "GET", "/openapi/v1/logistics/status/" + orderNo, null, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "GET", "/openapi/v1/logistics/status/" + orderNo, null, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 物流记录列表
     */
    @PostMapping("/logistics/list")
    public Result<Map<String, Object>> listLogistics(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppType(app, "LOGISTICS_SYNC");
            Map<String, Object> result = openApiOrchestrator.listLogisticsRecords(app, body);
            logSuccess(app, "POST", "/openapi/v1/logistics/list", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/logistics/list", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    // ========== 付款对接 (PAYMENT_SYNC) ==========

    /**
     * 查询待付款对账单
     */
    @GetMapping("/payment/pending")
    public Result<Map<String, Object>> getPendingPayments(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, "");
            validateAppType(app, "PAYMENT_SYNC");
            Map<String, Object> result = openApiOrchestrator.getPendingPayments(app);
            logSuccess(app, "GET", "/openapi/v1/payment/pending", null, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "GET", "/openapi/v1/payment/pending", null, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 确认付款
     */
    @PostMapping("/payment/confirm")
    public Result<Map<String, Object>> confirmPayment(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppType(app, "PAYMENT_SYNC");
            Map<String, Object> result = openApiOrchestrator.confirmPayment(app, body);
            logSuccess(app, "POST", "/openapi/v1/payment/confirm", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/payment/confirm", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 查询付款/对账记录
     */
    @PostMapping("/payment/list")
    public Result<Map<String, Object>> listPayments(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppType(app, "PAYMENT_SYNC");
            Map<String, Object> result = openApiOrchestrator.listPaymentRecords(app, body);
            logSuccess(app, "POST", "/openapi/v1/payment/list", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/payment/list", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    // ========== 面辅料供应对接 (MATERIAL_SUPPLY) ==========

    /**
     * 推送采购订单到供应商系统
     * 业务场景：采购员创建面辅料采购单后，自动推送到供应商ERP
     */
    @PostMapping("/material/purchase-order")
    public Result<Map<String, Object>> createPurchaseOrder(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppType(app, "MATERIAL_SUPPLY");
            Map<String, Object> result = openApiOrchestrator.pushPurchaseOrder(app, body);
            logSuccess(app, "POST", "/openapi/v1/material/purchase-order", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/material/purchase-order", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 客户批量上传采购记录（适合初始化导入）
     */
    @PostMapping("/material/purchase/upload")
    public Result<Map<String, Object>> uploadMaterialPurchases(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppType(app, "MATERIAL_SUPPLY");
            Map<String, Object> result = openApiOrchestrator.batchCreateMaterialPurchases(app, body);
            logSuccess(app, "POST", "/openapi/v1/material/purchase/upload", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/material/purchase/upload", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 查询供应商库存
     * 业务场景：采购前查询供应商实时库存，避免下单无货
     */
    @PostMapping("/material/inventory/query")
    public Result<Map<String, Object>> querySupplierInventory(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppType(app, "MATERIAL_SUPPLY");
            Map<String, Object> result = openApiOrchestrator.querySupplierInventory(app, body);
            logSuccess(app, "POST", "/openapi/v1/material/inventory/query", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/material/inventory/query", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 供应商推送采购单确认（Webhook回调）
     * 业务场景：供应商确认订单后推送状态更新
     */
    @PostMapping("/webhook/material/order-confirm")
    public Result<Map<String, Object>> receivePurchaseOrderConfirm(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppType(app, "MATERIAL_SUPPLY");
            Map<String, Object> result = openApiOrchestrator.receivePurchaseOrderConfirm(app, body);
            logSuccess(app, "POST", "/openapi/v1/webhook/material/order-confirm", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/webhook/material/order-confirm", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 供应商推送价格更新（Webhook回调）
     * 业务场景：供应商调价后自动同步到系统
     */
    @PostMapping("/webhook/material/price-update")
    public Result<Map<String, Object>> receivePriceUpdate(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppType(app, "MATERIAL_SUPPLY");
            Map<String, Object> result = openApiOrchestrator.receiveMaterialPriceUpdate(app, body);
            logSuccess(app, "POST", "/openapi/v1/webhook/material/price-update", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/webhook/material/price-update", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 供应商推送发货物流（Webhook回调）
     * 业务场景：供应商发货后推送物流单号和物流公司
     */
    @PostMapping("/webhook/material/shipping-update")
    public Result<Map<String, Object>> receiveShippingUpdate(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppType(app, "MATERIAL_SUPPLY");
            Map<String, Object> result = openApiOrchestrator.receiveMaterialShippingUpdate(app, body);
            logSuccess(app, "POST", "/openapi/v1/webhook/material/shipping-update", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/webhook/material/shipping-update", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    // ========== 数据导入（开通即用） (DATA_IMPORT + 兼容各专用类型) ==========

    /**
     * 客户批量上传款式资料（适合初始化导入）
     * 允许 DATA_IMPORT 或 ORDER_SYNC 类型的应用调用
     */
    @PostMapping("/style/upload")
    public Result<Map<String, Object>> uploadStyles(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppTypeMulti(app, "DATA_IMPORT", "ORDER_SYNC");
            Map<String, Object> result = openApiOrchestrator.batchCreateStyles(app, body);
            logSuccess(app, "POST", "/openapi/v1/style/upload", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/style/upload", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 客户批量上传工厂/供应商（适合初始化导入）
     * 允许 DATA_IMPORT 类型的应用调用
     */
    @PostMapping("/factory/upload")
    public Result<Map<String, Object>> uploadFactories(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppTypeMulti(app, "DATA_IMPORT", "ORDER_SYNC");
            Map<String, Object> result = openApiOrchestrator.batchCreateFactories(app, body);
            logSuccess(app, "POST", "/openapi/v1/factory/upload", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/factory/upload", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 客户批量上传员工/工人（适合初始化导入）
     * 允许 DATA_IMPORT 类型的应用调用
     * 默认密码: 123456，客户可在系统内修改
     */
    @PostMapping("/employee/upload")
    public Result<Map<String, Object>> uploadEmployees(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppTypeMulti(app, "DATA_IMPORT");
            Map<String, Object> result = openApiOrchestrator.batchCreateEmployees(app, body);
            logSuccess(app, "POST", "/openapi/v1/employee/upload", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/employee/upload", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 客户批量上传款式工序（适合初始化导入）
     * 允许 DATA_IMPORT 或 ORDER_SYNC 类型的应用调用
     */
    @PostMapping("/process/upload")
    public Result<Map<String, Object>> uploadProcesses(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppTypeMulti(app, "DATA_IMPORT", "ORDER_SYNC");
            Map<String, Object> result = openApiOrchestrator.batchCreateStyleProcesses(app, body);
            logSuccess(app, "POST", "/openapi/v1/process/upload", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/process/upload", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    // ========== 内部方法 ==========

    // ========== 数据拉取 (Pull from third-party) ==========

    /**
     * 从第三方系统拉取纸样/制单数据（需在管理端调用，非OpenAPI客户端）
     * 用于：客户系统已有纸样数据，我们主动拉取到本系统
     */
    @PostMapping("/pull/pattern-order")
    public Result<Map<String, Object>> pullPatternOrder(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature,
            @RequestBody String body,
            HttpServletRequest request) {
        long start = System.currentTimeMillis();
        TenantApp app = null;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, body);
            validateAppType(app, "ORDER_SYNC");
            Map<String, Object> result = openApiOrchestrator.pullExternalData(app, body);
            logSuccess(app, "POST", "/openapi/v1/pull/pattern-order", body, result, start, request);
            return Result.success(result);
        } catch (Exception e) {
            logError(app, "POST", "/openapi/v1/pull/pattern-order", body, e, start, request);
            return Result.fail(e.getMessage());
        }
    }

    private void validateAppType(TenantApp app, String expectedType) {
        if (!expectedType.equals(app.getAppType()) && !"DATA_IMPORT".equals(app.getAppType())) {
            throw new IllegalArgumentException("当前应用类型(" + app.getAppType() + ")无权调用此接口");
        }
    }

    /**
     * 验证应用类型（支持多个允许的类型）
     * DATA_IMPORT 类型可以访问所有上传接口
     */
    private void validateAppTypeMulti(TenantApp app, String... allowedTypes) {
        for (String type : allowedTypes) {
            if (type.equals(app.getAppType())) {
                return;
            }
        }
        throw new IllegalArgumentException("当前应用类型(" + app.getAppType() + ")无权调用此接口，允许类型: " + String.join(", ", allowedTypes));
    }

    private void logSuccess(TenantApp app, String method, String path, String requestBody,
                            Object result, long start, HttpServletRequest request) {
        if (app == null) return;
        long costMs = System.currentTimeMillis() - start;
        String responseBody = result != null ? result.toString() : "";
        tenantAppOrchestrator.logApiCall(app.getId(), app.getTenantId(), app.getAppType(),
                "INBOUND", method, path, requestBody, 200, responseBody, costMs,
                "SUCCESS", null, getClientIp(request));
    }

    private void logError(TenantApp app, String method, String path, String requestBody,
                          Exception e, long start, HttpServletRequest request) {
        long costMs = System.currentTimeMillis() - start;
        String appId = app != null ? app.getId() : null;
        Long tenantId = app != null ? app.getTenantId() : null;
        String appType = app != null ? app.getAppType() : null;
        tenantAppOrchestrator.logApiCall(appId, tenantId, appType,
                "INBOUND", method, path, requestBody, 500, null, costMs,
                "ERROR", e.getMessage(), getClientIp(request));
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty()) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty()) {
            ip = request.getRemoteAddr();
        }
        return ip;
    }
}
