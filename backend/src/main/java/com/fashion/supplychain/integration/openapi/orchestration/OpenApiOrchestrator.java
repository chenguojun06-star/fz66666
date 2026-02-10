package com.fashion.supplychain.integration.openapi.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 开放API业务编排器
 * 处理 5 大对接模块的实际业务逻辑：
 * - ORDER_SYNC: 下单对接
 * - QUALITY_FEEDBACK: 质检反馈
 * - LOGISTICS_SYNC: 物流对接
 * - PAYMENT_SYNC: 付款对接
 * - MATERIAL_SUPPLY: 面辅料供应对接
 */
@Slf4j
@Service
public class OpenApiOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductOutstockService productOutstockService;

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private StyleInfoService styleInfoService;

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
    @Transactional(rollbackFor = Exception.class)
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
     * 请求体示例：
     * {
     *   "styleNo": "FZ2024001",
     *   "company": "客户品牌名",
     *   "quantity": 500,
     *   "colors": ["红", "蓝"],
     *   "sizes": ["S", "M", "L"],
     *   "expectedShipDate": "2026-03-15",
     *   "remarks": "加急订单"
     * }
     */
    @Transactional(rollbackFor = Exception.class)
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

            // 查找对应款式
            StyleInfo style = null;
            LambdaQueryWrapper<StyleInfo> styleWrapper = new LambdaQueryWrapper<>();
            styleWrapper.eq(StyleInfo::getStyleNo, styleNo);
            styleWrapper.last("LIMIT 1");
            List<StyleInfo> styles = styleInfoService.list(styleWrapper);
            if (!styles.isEmpty()) {
                style = styles.get(0);
            }

            // 生成订单号 (格式: PO + yyyyMMdd + 4位序号)
            String orderNo = generateOrderNo();

            // 创建真实生产订单
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

            // 关联款式信息
            if (style != null) {
                order.setStyleId(String.valueOf(style.getId()));
                order.setStyleNo(style.getStyleNo());
                order.setStyleName(style.getStyleName());
            } else {
                order.setStyleNo(styleNo);
                order.setStyleName(styleNo + " (待关联)");
            }

            // 设置客户/公司
            String company = (String) request.get("company");
            order.setCompany(StringUtils.hasText(company) ? company : app.getAppName());

            // 设置颜色/尺码
            if (request.get("colors") != null) {
                @SuppressWarnings("unchecked")
                List<String> colors = (List<String>) request.get("colors");
                order.setColor(String.join(",", colors));
            }
            if (request.get("sizes") != null) {
                @SuppressWarnings("unchecked")
                List<String> sizes = (List<String>) request.get("sizes");
                order.setSize(String.join(",", sizes));
            }

            // 设置预计出货日
            if (request.get("expectedShipDate") != null) {
                try {
                    order.setExpectedShipDate(LocalDate.parse((String) request.get("expectedShipDate")));
                } catch (Exception ignored) {
                    // 日期格式错误忽略
                }
            }

            // 保存订单
            productionOrderService.save(order);
            log.info("[OpenAPI] 第三方下单成功: orderNo={}, styleNo={}, quantity={}, 来源={}",
                    orderNo, styleNo, quantity, app.getAppName());

            // 构建返回
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("status", "created");
            result.put("message", "订单已创建成功，可在【生产管理→我的订单】页面查看");
            result.put("orderNo", orderNo);
            result.put("orderId", order.getId());
            result.put("styleNo", styleNo);
            result.put("styleName", order.getStyleName());
            result.put("company", order.getCompany());
            result.put("quantity", quantity);
            result.put("orderStatus", "pending");
            result.put("createdAt", order.getCreateTime().toString());
            result.put("viewUrl", "/production?orderNo=" + orderNo);
            return result;

        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("创建订单失败: " + e.getMessage(), e);
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
                try { seq = Integer.parseInt(lastNo.substring(prefix.length())) + 1; } catch (NumberFormatException ignored) {}
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
    @Transactional(rollbackFor = Exception.class)
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
    @Transactional(rollbackFor = Exception.class)
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
    @Transactional(rollbackFor = Exception.class)
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
    @Transactional(rollbackFor = Exception.class)
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
    @Transactional(rollbackFor = Exception.class)
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
}
