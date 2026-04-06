package com.fashion.supplychain.integration.openapi.orchestration;

import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.integration.openapi.helper.OpenApiDataImportHelper;
import com.fashion.supplychain.integration.openapi.helper.OpenApiMaterialHelper;
import com.fashion.supplychain.integration.openapi.helper.OpenApiOrderHelper;
import com.fashion.supplychain.integration.openapi.helper.OpenApiTrackingHelper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * 开放平台 API 编排器 — 薄委托层
 * <p>
 * 实际业务逻辑已拆分到 4 个 Helper：
 * <ul>
 *   <li>OpenApiOrderHelper — 数据拉取 + 下单对接</li>
 *   <li>OpenApiTrackingHelper — 质检反馈 + 物流对接 + 付款对接</li>
 *   <li>OpenApiMaterialHelper — 面辅料供应对接</li>
 *   <li>OpenApiDataImportHelper — 数据导入（款式/工厂/员工/工序模板）</li>
 * </ul>
 */
@Slf4j
@Service
public class OpenApiOrchestrator {

    @Autowired private OpenApiOrderHelper orderHelper;
    @Autowired private OpenApiTrackingHelper trackingHelper;
    @Autowired private OpenApiMaterialHelper materialHelper;
    @Autowired private OpenApiDataImportHelper dataImportHelper;

    // ========== 数据拉取 + 下单对接 ==========

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> pullExternalData(TenantApp app, String body) {
        return orderHelper.pullExternalData(app, body);
    }
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createExternalOrder(TenantApp app, String body) {
        return orderHelper.createExternalOrder(app, body);
    }
    public Map<String, Object> getOrderStatus(TenantApp app, String orderNo) {
        return orderHelper.getOrderStatus(app, orderNo);
    }
    public Map<String, Object> listExternalOrders(TenantApp app, String body) {
        return orderHelper.listExternalOrders(app, body);
    }
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> batchCreateExternalOrders(TenantApp app, String body) {
        return orderHelper.batchCreateExternalOrders(app, body);
    }

    // ========== 质检反馈 + 物流对接 + 付款对接 ==========

    public Map<String, Object> getQualityReport(TenantApp app, String orderNo) {
        return trackingHelper.getQualityReport(app, orderNo);
    }
    public Map<String, Object> listQualityRecords(TenantApp app, String body) {
        return trackingHelper.listQualityRecords(app, body);
    }
    public Map<String, Object> getLogisticsStatus(TenantApp app, String orderNo) {
        return trackingHelper.getLogisticsStatus(app, orderNo);
    }
    public Map<String, Object> listLogisticsRecords(TenantApp app, String body) {
        return trackingHelper.listLogisticsRecords(app, body);
    }
    public Map<String, Object> getPendingPayments(TenantApp app) {
        return trackingHelper.getPendingPayments(app);
    }
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> confirmPayment(TenantApp app, String body) {
        return trackingHelper.confirmPayment(app, body);
    }
    public Map<String, Object> listPaymentRecords(TenantApp app, String body) {
        return trackingHelper.listPaymentRecords(app, body);
    }

    // ========== 面辅料供应对接 ==========

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> pushPurchaseOrder(TenantApp app, String body) {
        return materialHelper.pushPurchaseOrder(app, body);
    }
    public Map<String, Object> querySupplierInventory(TenantApp app, String body) {
        return materialHelper.querySupplierInventory(app, body);
    }
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> receivePurchaseOrderConfirm(TenantApp app, String body) {
        return materialHelper.receivePurchaseOrderConfirm(app, body);
    }
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> receiveMaterialPriceUpdate(TenantApp app, String body) {
        return materialHelper.receiveMaterialPriceUpdate(app, body);
    }
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> receiveMaterialShippingUpdate(TenantApp app, String body) {
        return materialHelper.receiveMaterialShippingUpdate(app, body);
    }
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> batchCreateMaterialPurchases(TenantApp app, String body) {
        return materialHelper.batchCreateMaterialPurchases(app, body);
    }

    // ========== 数据导入 ==========

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> batchCreateStyles(TenantApp app, String body) {
        return dataImportHelper.batchCreateStyles(app, body);
    }
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> batchCreateFactories(TenantApp app, String body) {
        return dataImportHelper.batchCreateFactories(app, body);
    }
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> batchCreateEmployees(TenantApp app, String body) {
        return dataImportHelper.batchCreateEmployees(app, body);
    }
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> batchCreateStyleProcesses(TenantApp app, String body) {
        return dataImportHelper.batchCreateStyleProcesses(app, body);
    }
}
