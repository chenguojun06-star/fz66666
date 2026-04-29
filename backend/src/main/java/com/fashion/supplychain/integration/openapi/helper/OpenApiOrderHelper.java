package com.fashion.supplychain.integration.openapi.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * OpenAPI 订单对接 Helper — 数据拉取 + 下单对接
 * 从 OpenApiOrchestrator 拆分
 */
@Slf4j
@Component
public class OpenApiOrderHelper {

    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private MaterialPurchaseService materialPurchaseService;
    @Autowired private StyleInfoService styleInfoService;
    @Autowired private StyleProcessService styleProcessService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RestTemplate restTemplate = new RestTemplate();

    // ========== 数据拉取 (Pull from third-party) ==========

    /**
     * 从第三方系统拉取纸样/制单数据
     * 通过 TenantApp.externalApiUrl 将请求转发到客户系统，获取纸样、制单等数据后导入本系统
     *
     * 请求体示例:
     * {
     *   "action": "list_patterns",           // list_patterns | list_orders | get_pattern | get_order
     *   "params": { "status": "ready", "page": 1, "size": 20 }
     * }
     *
     * 或自动创建订单:
     * {
     *   "action": "import_order",
     *   "externalOrderId": "EXT-12345",
     *   "styleNo": "FZ2024001",
     *   "quantity": 500,
     *   "colors": ["红", "蓝"],
     *   "sizes": ["S", "M", "L"]
     * }
     */
    public Map<String, Object> pullExternalData(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            String action = (String) request.get("action");

            if (!StringUtils.hasText(action)) {
                throw new IllegalArgumentException("缺少必填参数: action (list_patterns/list_orders/get_pattern/get_order/import_order)");
            }

            // import_order: 直接在本系统创建订单（等同于 createExternalOrder 但带 externalOrderId 标记）
            if ("import_order".equals(action)) {
                return createExternalOrder(app, body);
            }

            // 其他 action: 通过 externalApiUrl 转发请求到客户系统
            String externalApiUrl = app.getExternalApiUrl();
            if (!StringUtils.hasText(externalApiUrl)) {
                throw new IllegalArgumentException("该应用未配置客户API地址(externalApiUrl)，无法拉取数据。请在【客户应用管理→应用详情】中配置。");
            }

            // 构建请求到客户系统
            String targetUrl = externalApiUrl.endsWith("/") ? externalApiUrl + action : externalApiUrl + "/" + action;
            @SuppressWarnings("unchecked")
            Map<String, Object> params = (Map<String, Object>) request.getOrDefault("params", new LinkedHashMap<>());

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Source", "fashion-supplychain");
            headers.set("X-App-Key", app.getAppKey());

            String reqBody = objectMapper.writeValueAsString(params);
            HttpEntity<String> entity = new HttpEntity<>(reqBody, headers);

            log.info("[OpenAPI Pull] 拉取第三方数据: url={}, action={}, app={}", targetUrl, action, app.getAppName());

            ResponseEntity<String> response = restTemplate.exchange(targetUrl, HttpMethod.POST, entity, String.class);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("action", action);
            result.put("source", externalApiUrl);
            result.put("httpStatus", response.getStatusCodeValue());

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                try {
                    Object responseData = objectMapper.readValue(response.getBody(), Object.class);
                    result.put("data", responseData);
                } catch (Exception e) {
                    result.put("data", response.getBody());
                }
                result.put("success", true);
            } else {
                result.put("success", false);
                result.put("error", "第三方系统返回非成功状态: " + response.getStatusCodeValue());
            }
            return result;

        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("拉取第三方数据失败: " + e.getMessage(), e);
        }
    }

    // ========== 下单对接 (ORDER_SYNC) ==========

    /**
     * 客户系统创建生产订单 — 真实创建订单，可在"我的订单"页面查看
     * 请求体示例（完整字段）：
     * {
     *   "styleNo": "FZ2024001",           // 必填：款号（匹配系统款式）
     *   "company": "客户品牌名",           // 客户/品牌
     *   "quantity": 500,                  // 必填：订单数量
     *   "colors": ["红", "蓝"],           // 颜色列表
     *   "sizes": ["S", "M", "L"],         // 尺码列表
     *   "expectedShipDate": "2026-03-15", // 预计出货日期
     *   "remarks": "加急订单",            // 备注
     *   "merchandiser": "跟单员姓名",      // 跟单员
     *   "patternMaker": "纸样师姓名",      // 纸样师
     *   "productCategory": "上衣",        // 品类
     *   "factoryName": "XX加工厂",        // 指定加工厂名称
     *   "plannedStartDate": "2026-03-01", // 计划开工日期（yyyy-MM-dd）
     *   "plannedEndDate": "2026-03-14",   // 计划完工日期（yyyy-MM-dd）
     *   "processUnitPrices": [           // 自定义工序单价（不传则自动从款式工序表带入）
     *     { "processName": "裁剪", "processCode": "CUT", "unitPrice": 0.5 },
     *     { "processName": "车缝", "processCode": "SEW", "unitPrice": 2.0 }
     *   ]
     * }
     * 注意：不传 processUnitPrices 时，系统自动读取款式（styleNo）的已配置工序单价
     */
    public Map<String, Object> createExternalOrder(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            String styleNo = (String) request.get("styleNo");
            if (!StringUtils.hasText(styleNo)) {
                throw new IllegalArgumentException("缺少必填参数: styleNo");
            }
            Integer quantity = request.get("quantity") != null ? ((Number) request.get("quantity")).intValue() : null;
            if (quantity == null || quantity <= 0) {
                throw new IllegalArgumentException("缺少必填参数: quantity (必须大于0)");
            }

            StyleInfo style = findStyleByNo(styleNo);
            String orderNo = generateOrderNo();
            ProductionOrder order = buildExternalOrder(app, request, styleNo, quantity, style, orderNo);
            applyRequestOverrides(order, request);
            applyStyleDefaults(order, style, request);
            applyProcessUnitPrices(order, style, request);
            applyTenantAndSave(app, order);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("success", true);
            result.put("orderId", order.getId());
            result.put("orderNo", orderNo);
            result.put("styleNo", order.getStyleNo());
            result.put("quantity", order.getOrderQuantity());
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("创建外部订单失败: " + e.getMessage(), e);
        }
    }

    private StyleInfo findStyleByNo(String styleNo) {
        LambdaQueryWrapper<StyleInfo> styleWrapper = new LambdaQueryWrapper<>();
        styleWrapper.eq(StyleInfo::getStyleNo, styleNo);
        styleWrapper.last("LIMIT 1");
        List<StyleInfo> styles = styleInfoService.list(styleWrapper);
        return styles.isEmpty() ? null : styles.get(0);
    }

    private ProductionOrder buildExternalOrder(TenantApp app, Map<String, Object> request,
            String styleNo, Integer quantity, StyleInfo style, String orderNo) {
        ProductionOrder order = new ProductionOrder();
        order.setOrderNo(orderNo);
        order.setOrderQuantity(quantity);
        order.setCompletedQuantity(0);
        order.setProductionProgress(0);
        order.setMaterialArrivalRate(0);
        order.setStatus("pending");
        order.setDeleteFlag(0);
        order.setCreateTime(LocalDateTime.now());
        order.setCreatedByName("OpenAPI-" + app.getAppName());
        order.setRemarks("[第三方下单] " + (request.get("remarks") != null ? request.get("remarks") : "")
                + " | 来源: " + app.getAppName()
                + " | appKey: " + app.getAppKey().substring(0, Math.min(8, app.getAppKey().length())) + "***");
        if (style != null) {
            order.setStyleId(String.valueOf(style.getId()));
            order.setStyleNo(style.getStyleNo());
            order.setStyleName(style.getStyleName());
            if (StringUtils.hasText(style.getCategory())) order.setProductCategory(style.getCategory());
        } else {
            order.setStyleNo(styleNo);
            order.setStyleName(styleNo + " (待关联)");
        }
        return order;
    }

    private void applyRequestOverrides(ProductionOrder order, Map<String, Object> request) {
        if (request.get("merchandiser") != null) order.setMerchandiser((String) request.get("merchandiser"));
        if (request.get("company") != null) order.setCompany((String) request.get("company"));
        if (request.get("factoryName") != null) order.setFactoryName((String) request.get("factoryName"));
        if (request.get("productCategory") != null) order.setProductCategory((String) request.get("productCategory"));
        if (request.get("expectedShipDate") != null) {
            try { order.setExpectedShipDate(LocalDate.parse((String) request.get("expectedShipDate"))); }
            catch (Exception e) { log.warn("日期解析失败: expectedShipDate={}", request.get("expectedShipDate")); }
        }
        if (request.get("plannedStartDate") != null) {
            try { order.setPlannedStartDate(LocalDate.parse((String) request.get("plannedStartDate")).atStartOfDay()); }
            catch (Exception e) { log.warn("日期解析失败: plannedStartDate={}", request.get("plannedStartDate")); }
        }
        if (request.get("plannedEndDate") != null) {
            try { order.setPlannedEndDate(LocalDate.parse((String) request.get("plannedEndDate")).atStartOfDay()); }
            catch (Exception e) { log.warn("日期解析失败: plannedEndDate={}", request.get("plannedEndDate")); }
        }
        Object colorsObj = request.get("colors");
        if (colorsObj instanceof List && !((List<?>) colorsObj).isEmpty()) {
            order.setColor(String.join(",", ((List<String>) colorsObj)));
        }
        Object sizesObj = request.get("sizes");
        if (sizesObj instanceof List && !((List<?>) sizesObj).isEmpty()) {
            order.setSize(String.join(",", ((List<String>) sizesObj)));
        }
    }

    private void applyStyleDefaults(ProductionOrder order, StyleInfo style, Map<String, Object> request) {
        if (style == null) return;
        if (!StringUtils.hasText(order.getProductCategory()) && StringUtils.hasText(style.getCategory())) {
            order.setProductCategory(style.getCategory());
        }
    }

    @SuppressWarnings("unchecked")
    private void applyProcessUnitPrices(ProductionOrder order, StyleInfo style, Map<String, Object> request) {
        Object pricesObj = request.get("processUnitPrices");
        List<Map<String, Object>> customPrices = null;
        if (pricesObj instanceof List) {
            customPrices = (List<Map<String, Object>>) pricesObj;
        }
        if ((customPrices == null || customPrices.isEmpty()) && style != null) {
            try {
                List<StyleProcess> processes = styleProcessService.listByStyleId(Long.valueOf(style.getId()));
                if (processes != null && !processes.isEmpty()) {
                    customPrices = new ArrayList<>();
                    for (StyleProcess sp : processes) {
                        Map<String, Object> p = new LinkedHashMap<>();
                        p.put("processName", sp.getProcessName());
                        p.put("processCode", sp.getProcessCode());
                        p.put("unitPrice", sp.getPrice());
                        customPrices.add(p);
                    }
                }
            } catch (Exception e) {
                log.warn("从款式工序表读取单价失败: styleId={}", style.getId(), e);
            }
        }
        if (customPrices != null && !customPrices.isEmpty()) {
            try {
                List<Map<String, Object>> nodes = new ArrayList<>();
                for (Map<String, Object> p : customPrices) {
                    Map<String, Object> node = new LinkedHashMap<>();
                    node.put("id", p.getOrDefault("processCode", ""));
                    node.put("name", p.getOrDefault("processName", ""));
                    node.put("unitPrice", p.getOrDefault("unitPrice", 0));
                    nodes.add(node);
                }
                Map<String, Object> workflow = new LinkedHashMap<>();
                workflow.put("nodes", nodes);
                order.setProgressWorkflowJson(objectMapper.writeValueAsString(workflow));
            } catch (Exception e) {
                log.warn("设置工序单价JSON失败", e);
            }
        }
    }

    private void applyTenantAndSave(TenantApp app, ProductionOrder order) {
        if (app.getTenantId() != null) {
            order.setTenantId(app.getTenantId());
        }
        boolean ok = productionOrderService.save(order);
        if (!ok) {
            throw new RuntimeException("创建生产订单失败");
        }
        try {
            log.info("[OpenAPI] 订单创建完成，跳过自动采购生成: orderId={}", order.getId());
        } catch (Exception e) {
            log.warn("自动生成采购任务失败: orderId={}", order.getId(), e);
        }
    }


    /**
     * 生成唯一订单号
     */
    private String generateOrderNo() {
        String prefix = "PO" + DateTimeFormatter.ofPattern("yyyyMMdd").format(LocalDateTime.now());
        LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.likeRight(ProductionOrder::getOrderNo, prefix);
        wrapper.orderByDesc(ProductionOrder::getOrderNo);
        wrapper.last("LIMIT 1");
        ProductionOrder lastOrder = productionOrderService.getOne(wrapper);
        int seq = 1;
        if (lastOrder != null && StringUtils.hasText(lastOrder.getOrderNo())) {
            String lastNo = lastOrder.getOrderNo();
            if (lastNo.length() >= prefix.length() + 4) {
                try { seq = Integer.parseInt(lastNo.substring(prefix.length())) + 1; } catch (NumberFormatException e) { log.debug("数字解析失败: {}", e.getMessage()); }
            }
        }
        return prefix + String.format("%04d", seq);
    }

    /**
     * 查询订单状态
     */
    public Map<String, Object> getOrderStatus(TenantApp app, String orderNo) {
        // 只查询该应用创建的订单（租户隔离）
        var orders = productionOrderService.list(
            new LambdaQueryWrapper<com.fashion.supplychain.production.entity.ProductionOrder>()
                .eq(com.fashion.supplychain.production.entity.ProductionOrder::getOrderNo, orderNo)
                .likeRight(com.fashion.supplychain.production.entity.ProductionOrder::getCreatedByName, "OpenAPI-")
        );

        if (orders.isEmpty()) {
            throw new IllegalArgumentException("订单不存在: " + orderNo);
        }

        var order = orders.get(0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderNo", order.getOrderNo());
        result.put("styleNo", order.getStyleNo());
        result.put("styleName", order.getStyleName());
        result.put("status", order.getStatus());
        result.put("orderQuantity", order.getOrderQuantity());
        result.put("completedQuantity", order.getCompletedQuantity());
        result.put("productionProgress", order.getProductionProgress());
        result.put("materialArrivalRate", order.getMaterialArrivalRate());
        result.put("factoryName", order.getFactoryName());
        result.put("plannedStartDate", order.getPlannedStartDate());
        result.put("plannedEndDate", order.getPlannedEndDate());
        result.put("actualStartDate", order.getActualStartDate());
        result.put("actualEndDate", order.getActualEndDate());
        result.put("expectedShipDate", order.getExpectedShipDate());
        return result;
    }

    /**
     * 查询订单列表
     */
    public Map<String, Object> listExternalOrders(TenantApp app, String body) {
        try {
            Map<String, Object> params = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            int page = params.get("page") != null ? ((Number) params.get("page")).intValue() : 1;
            int size = params.get("size") != null ? ((Number) params.get("size")).intValue() : 20;
            String status = (String) params.get("status");

            LambdaQueryWrapper<com.fashion.supplychain.production.entity.ProductionOrder> wrapper = new LambdaQueryWrapper<>();
            // 租户隔离：只查询通过OpenAPI创建的订单
            wrapper.likeRight(com.fashion.supplychain.production.entity.ProductionOrder::getCreatedByName, "OpenAPI-");
            if (StringUtils.hasText(status)) {
                wrapper.eq(com.fashion.supplychain.production.entity.ProductionOrder::getStatus, status);
            }
            wrapper.orderByDesc(com.fashion.supplychain.production.entity.ProductionOrder::getCreateTime);

            Page<com.fashion.supplychain.production.entity.ProductionOrder> pageResult =
                productionOrderService.page(new Page<>(page, size), wrapper);

            List<Map<String, Object>> records = new ArrayList<>();
            for (var order : pageResult.getRecords()) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("orderNo", order.getOrderNo());
                item.put("styleNo", order.getStyleNo());
                item.put("styleName", order.getStyleName());
                item.put("status", order.getStatus());
                item.put("orderQuantity", order.getOrderQuantity());
                item.put("completedQuantity", order.getCompletedQuantity());
                item.put("productionProgress", order.getProductionProgress());
                item.put("expectedShipDate", order.getExpectedShipDate());
                records.add(item);
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("total", pageResult.getTotal());
            result.put("page", pageResult.getCurrent());
            result.put("size", pageResult.getSize());
            result.put("records", records);
            return result;
        } catch (Exception e) {
            throw new RuntimeException("查询订单列表失败: " + e.getMessage(), e);
        }
    }

    /**
     * 批量创建订单
     * 请求体示例：
     * {
     *   "strict": false,
     *   "orders": [
     *     {
     *       "styleNo": "FZ2024001",
     *       "company": "客户A",
     *       "quantity": 500,
     *       "colors": ["黑色"],
     *       "sizes": ["M"],
     *       "expectedShipDate": "2026-03-15",
     *       "remarks": "首批导入"
     *     }
     *   ]
     * }
     */
    public Map<String, Object> batchCreateExternalOrders(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> orders = (List<Map<String, Object>>) request.get("orders");
            boolean strict = request.get("strict") != null && Boolean.TRUE.equals(request.get("strict"));

            if (orders == null || orders.isEmpty()) {
                throw new IllegalArgumentException("缺少必填参数: orders");
            }
            if (orders.size() > 200) {
                throw new IllegalArgumentException("单次最多上传 200 条订单");
            }

            List<Map<String, Object>> successRecords = new ArrayList<>();
            List<Map<String, Object>> failedRecords = new ArrayList<>();

            for (int index = 0; index < orders.size(); index++) {
                Map<String, Object> orderItem = orders.get(index);
                try {
                    String singleBody = objectMapper.writeValueAsString(orderItem);
                    Map<String, Object> created = createExternalOrder(app, singleBody);
                    created.put("index", index + 1);
                    successRecords.add(created);
                } catch (Exception e) {
                    Map<String, Object> fail = new LinkedHashMap<>();
                    fail.put("index", index + 1);
                    fail.put("styleNo", orderItem.get("styleNo"));
                    fail.put("quantity", orderItem.get("quantity"));
                    fail.put("error", e.getMessage());
                    failedRecords.add(fail);
                    if (strict) {
                        throw new IllegalArgumentException("第 " + (index + 1) + " 条失败: " + e.getMessage());
                    }
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("total", orders.size());
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
            throw new RuntimeException("批量创建订单失败: " + e.getMessage(), e);
        }
    }

}
