package com.fashion.supplychain.integration.openapi.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * OpenAPI 面辅料供应对接 Helper
 * 从 OpenApiOrchestrator 拆分
 */
@Slf4j
@Component
public class OpenApiMaterialHelper {

    @Autowired private MaterialPurchaseService materialPurchaseService;
    @Autowired private ProductionOrderService productionOrderService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RestTemplate restTemplate = new RestTemplate();

    // ========== 面辅料供应对接 (MATERIAL_SUPPLY) ==========

    /**
     * 推送采购订单到供应商系统
     * 通过 TenantApp.externalApiUrl 将采购单推送到供应商ERP
     *
     * 请求体示例:
     * {
     *   "purchaseOrderNo": "PO20260210001",
     *   "supplierCode": "SUP001",
     *   "items": [
     *     { "materialCode": "F001", "materialName": "涤纶面料", "color": "黑色", "quantity": 500, "unit": "米" }
     *   ],
     *   "requiredDate": "2026-03-01",
     *   "remark": "急单"
     * }
     */
    public Map<String, Object> pushPurchaseOrder(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            String purchaseOrderNo = (String) request.get("purchaseOrderNo");
            if (!StringUtils.hasText(purchaseOrderNo)) {
                throw new IllegalArgumentException("缺少必填参数: purchaseOrderNo");
            }

            String externalApiUrl = app.getExternalApiUrl();
            if (!StringUtils.hasText(externalApiUrl)) {
                throw new IllegalArgumentException("该应用未配置供应商API地址(externalApiUrl)，请在【客户应用管理→应用详情】中配置。");
            }

            // 推送到供应商系统
            String pushUrl = externalApiUrl + "/api/purchase-order/receive";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Source", "yunshang-erp");
            headers.set("X-Tenant-Id", String.valueOf(app.getTenantId()));

            HttpEntity<String> httpEntity = new HttpEntity<>(body, headers);
            try {
                ResponseEntity<String> response = restTemplate.exchange(pushUrl, HttpMethod.POST, httpEntity, String.class);
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("purchaseOrderNo", purchaseOrderNo);
                result.put("pushStatus", "SUCCESS");
                result.put("supplierResponse", response.getBody());
                result.put("message", "采购订单已推送至供应商系统");
                return result;
            } catch (Exception e) {
                log.warn("推送采购订单到供应商失败: {}, url: {}", e.getMessage(), pushUrl);
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("purchaseOrderNo", purchaseOrderNo);
                result.put("pushStatus", "FAILED");
                result.put("error", e.getMessage());
                result.put("message", "推送失败，已记录日志，请检查供应商API是否可用");
                return result;
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("推送采购订单失败: " + e.getMessage(), e);
        }
    }

    /**
     * 查询供应商库存
     * 主动从供应商系统拉取库存数据
     *
     * 请求体示例:
     * {
     *   "materialCodes": ["F001", "F002"],
     *   "supplierCode": "SUP001"
     * }
     */
    public Map<String, Object> querySupplierInventory(TenantApp app, String body) {
        try {
            String externalApiUrl = app.getExternalApiUrl();
            if (!StringUtils.hasText(externalApiUrl)) {
                throw new IllegalArgumentException("该应用未配置供应商API地址(externalApiUrl)，无法查询库存。");
            }

            String queryUrl = externalApiUrl + "/api/inventory/query";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Source", "yunshang-erp");
            headers.set("X-Tenant-Id", String.valueOf(app.getTenantId()));

            HttpEntity<String> httpEntity = new HttpEntity<>(body, headers);
            ResponseEntity<String> response = restTemplate.exchange(queryUrl, HttpMethod.POST, httpEntity, String.class);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("queryStatus", "SUCCESS");
            result.put("inventoryData", response.getBody());
            result.put("queryTime", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            result.put("message", "供应商库存查询成功");
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("查询供应商库存失败: " + e.getMessage(), e);
        }
    }

    /**
     * 接收供应商采购单确认回调 (Webhook)
     *
     * 请求体示例（供应商推送）:
     * {
     *   "purchaseOrderNo": "PO20260210001",
     *   "confirmStatus": "ACCEPTED",
     *   "estimatedDeliveryDate": "2026-03-05",
     *   "supplierOrderNo": "SO-123456",
     *   "remark": "已安排生产"
     * }
     */
    public Map<String, Object> receivePurchaseOrderConfirm(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            String purchaseOrderNo = (String) request.get("purchaseOrderNo");
            String confirmStatus = (String) request.get("confirmStatus");

            if (!StringUtils.hasText(purchaseOrderNo) || !StringUtils.hasText(confirmStatus)) {
                throw new IllegalArgumentException("缺少必填参数: purchaseOrderNo, confirmStatus");
            }

            log.info("[面辅料供应] 收到供应商订单确认: purchaseOrderNo={}, status={}", purchaseOrderNo, confirmStatus);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("purchaseOrderNo", purchaseOrderNo);
            result.put("confirmStatus", confirmStatus);
            result.put("receivedAt", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            result.put("message", "采购单确认已接收");
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("处理供应商确认失败: " + e.getMessage(), e);
        }
    }

    /**
     * 接收供应商价格更新回调 (Webhook)
     *
     * 请求体示例（供应商推送）:
     * {
     *   "priceUpdates": [
     *     { "materialCode": "F001", "materialName": "涤纶面料", "oldPrice": 25.00, "newPrice": 28.50, "effectiveDate": "2026-03-01" }
     *   ]
     * }
     */
    public Map<String, Object> receiveMaterialPriceUpdate(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            List<Map<String, Object>> priceUpdates = (List<Map<String, Object>>) request.get("priceUpdates");

            if (priceUpdates == null || priceUpdates.isEmpty()) {
                throw new IllegalArgumentException("缺少必填参数: priceUpdates");
            }

            log.info("[面辅料供应] 收到供应商价格更新: {} 条记录", priceUpdates.size());

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("updatedCount", priceUpdates.size());
            result.put("receivedAt", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            result.put("message", "价格更新已接收，共 " + priceUpdates.size() + " 条");
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("处理价格更新失败: " + e.getMessage(), e);
        }
    }

    /**
     * 接收供应商发货物流回调 (Webhook)
     *
     * 请求体示例（供应商推送）:
     * {
     *   "purchaseOrderNo": "PO20260210001",
     *   "shippingNo": "SF1234567890",
     *   "logisticsCompany": "顺丰速运",
     *   "shippedAt": "2026-03-03T10:30:00",
     *   "items": [
     *     { "materialCode": "F001", "shippedQuantity": 500 }
     *   ]
     * }
     */
    public Map<String, Object> receiveMaterialShippingUpdate(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            String purchaseOrderNo = (String) request.get("purchaseOrderNo");
            String shippingNo = (String) request.get("shippingNo");

            if (!StringUtils.hasText(purchaseOrderNo) || !StringUtils.hasText(shippingNo)) {
                throw new IllegalArgumentException("缺少必填参数: purchaseOrderNo, shippingNo");
            }

            log.info("[面辅料供应] 收到供应商发货通知: purchaseOrderNo={}, shippingNo={}", purchaseOrderNo, shippingNo);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("purchaseOrderNo", purchaseOrderNo);
            result.put("shippingNo", shippingNo);
            result.put("receivedAt", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            result.put("message", "发货物流信息已接收，可在【仓库管理→面辅料库存】查看");
            result.put("viewUrl", "/warehouse/material");
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("处理发货物流失败: " + e.getMessage(), e);
        }
    }

    /**
     * 批量创建面辅料采购
     * 请求体示例：
     * {
     *   "strict": false,
     *   "materialPurchases": [
     *     {
     *       "orderNo": "PO202602140001",
     *       "materialCode": "MAT001",
     *       "materialName": "面料A",
     *       "materialType": "FABRIC",
     *       "specifications": "180g",
     *       "unit": "米",
     *       "purchaseQuantity": 200,
     *       "arrivedQuantity": 0,
     *       "unitPrice": 12.5,
     *       "supplierName": "供应商A",
     *       "expectedArrivalDate": "2026-03-01",
     *       "remark": "客户首批迁移"
     *     }
     *   ]
     * }
     */
    public Map<String, Object> batchCreateMaterialPurchases(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> purchases = (List<Map<String, Object>>) request.get("materialPurchases");
            boolean strict = request.get("strict") != null && Boolean.TRUE.equals(request.get("strict"));

            if (purchases == null || purchases.isEmpty()) {
                throw new IllegalArgumentException("缺少必填参数: materialPurchases");
            }
            if (purchases.size() > 300) {
                throw new IllegalArgumentException("单次最多上传 300 条采购记录");
            }

            List<Map<String, Object>> successRecords = new ArrayList<>();
            List<Map<String, Object>> failedRecords = new ArrayList<>();

            for (int index = 0; index < purchases.size(); index++) {
                Map<String, Object> item = purchases.get(index);
                try {
                    String orderNo = String.valueOf(item.get("orderNo") == null ? "" : item.get("orderNo")).trim();
                    String materialName = String.valueOf(item.get("materialName") == null ? "" : item.get("materialName")).trim();
                    Integer purchaseQuantity = OpenApiParseUtils.parseInteger(item.get("purchaseQuantity"));

                    if (!StringUtils.hasText(orderNo)) {
                        throw new IllegalArgumentException("orderNo 不能为空");
                    }
                    if (!StringUtils.hasText(materialName)) {
                        throw new IllegalArgumentException("materialName 不能为空");
                    }
                    if (purchaseQuantity == null || purchaseQuantity <= 0) {
                        throw new IllegalArgumentException("purchaseQuantity 必须为正整数");
                    }

                    ProductionOrder order = productionOrderService.getOne(
                            new LambdaQueryWrapper<ProductionOrder>()
                                    .eq(ProductionOrder::getOrderNo, orderNo)
                                    .last("LIMIT 1")
                    );
                    if (order == null) {
                        throw new IllegalArgumentException("订单不存在: " + orderNo);
                    }

                    MaterialPurchase purchase = new MaterialPurchase();
                    purchase.setOrderId(order.getId());
                    purchase.setOrderNo(order.getOrderNo());
                    purchase.setStyleId(order.getStyleId());
                    purchase.setStyleNo(order.getStyleNo());
                    purchase.setStyleName(order.getStyleName());
                    purchase.setColor(OpenApiParseUtils.valueAsString(item.get("color"), order.getColor()));
                    purchase.setSize(OpenApiParseUtils.valueAsString(item.get("size"), order.getSize()));

                    purchase.setMaterialCode(OpenApiParseUtils.valueAsString(item.get("materialCode"), null));
                    purchase.setMaterialName(materialName);
                    purchase.setMaterialType(OpenApiParseUtils.valueAsString(item.get("materialType"), "FABRIC"));
                    purchase.setSpecifications(OpenApiParseUtils.valueAsString(item.get("specifications"), null));
                    purchase.setUnit(OpenApiParseUtils.valueAsString(item.get("unit"), "米"));
                    purchase.setPurchaseQuantity(purchaseQuantity != null ? new BigDecimal(purchaseQuantity) : null);
                    purchase.setArrivedQuantity(OpenApiParseUtils.parseInteger(item.get("arrivedQuantity")) == null ? 0 : OpenApiParseUtils.parseInteger(item.get("arrivedQuantity")));
                    purchase.setSupplierName(OpenApiParseUtils.valueAsString(item.get("supplierName"), app.getAppName()));
                    purchase.setRemark(OpenApiParseUtils.valueAsString(item.get("remark"), "[OpenAPI批量上传]"));
                    purchase.setStatus(OpenApiParseUtils.valueAsString(item.get("status"), "pending"));
                    purchase.setSourceType("order");

                    BigDecimal unitPrice = OpenApiParseUtils.parseDecimal(item.get("unitPrice"));
                    purchase.setUnitPrice(unitPrice == null ? BigDecimal.ZERO : unitPrice);

                    String expectedArrivalDate = OpenApiParseUtils.valueAsString(item.get("expectedArrivalDate"), null);
                    if (StringUtils.hasText(expectedArrivalDate)) {
                        try {
                            purchase.setExpectedArrivalDate(LocalDate.parse(expectedArrivalDate).atStartOfDay());
                        } catch (Exception ignored) {
                            throw new IllegalArgumentException("expectedArrivalDate 格式错误，需为 yyyy-MM-dd");
                        }
                    }

                    boolean saved = materialPurchaseService.savePurchaseAndUpdateOrder(purchase);
                    if (!saved) {
                        throw new RuntimeException("保存采购记录失败");
                    }

                    Map<String, Object> successItem = new LinkedHashMap<>();
                    successItem.put("index", index + 1);
                    successItem.put("purchaseId", purchase.getId());
                    successItem.put("purchaseNo", purchase.getPurchaseNo());
                    successItem.put("orderNo", purchase.getOrderNo());
                    successItem.put("materialName", purchase.getMaterialName());
                    successItem.put("status", purchase.getStatus());
                    successRecords.add(successItem);
                } catch (Exception e) {
                    Map<String, Object> fail = new LinkedHashMap<>();
                    fail.put("index", index + 1);
                    fail.put("orderNo", item.get("orderNo"));
                    fail.put("materialName", item.get("materialName"));
                    fail.put("error", e.getMessage());
                    failedRecords.add(fail);
                    if (strict) {
                        throw new IllegalArgumentException("第 " + (index + 1) + " 条失败: " + e.getMessage());
                    }
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("total", purchases.size());
            result.put("successCount", successRecords.size());
            result.put("failedCount", failedRecords.size());
            result.put("strict", strict);
            result.put("successRecords", successRecords);
            result.put("failedRecords", failedRecords);
            result.put("message", failedRecords.isEmpty() ? "批量上传成功" : "批量上传完成，存在部分失败记录");
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("批量创建采购记录失败: " + e.getMessage(), e);
        }
    }

}
