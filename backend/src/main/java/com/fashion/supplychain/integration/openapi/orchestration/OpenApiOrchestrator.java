package com.fashion.supplychain.integration.openapi.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.UserService;
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
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private UserService userService;

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
                // 款式带入品类（StyleInfo.category → ProductionOrder.productCategory）
                if (StringUtils.hasText(style.getCategory())) order.setProductCategory(style.getCategory());
            } else {
                order.setStyleNo(styleNo);
                order.setStyleName(styleNo + " (待关联)");
            }

            // 请求体字段覆盖默认值
            if (request.get("merchandiser") != null) order.setMerchandiser((String) request.get("merchandiser"));
            if (request.get("patternMaker") != null) order.setPatternMaker((String) request.get("patternMaker"));
            if (request.get("productCategory") != null) order.setProductCategory((String) request.get("productCategory"));
            if (request.get("factoryName") != null) order.setFactoryName((String) request.get("factoryName"));

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
                } catch (Exception ignored) { }
            }

            // 设置计划开工/完工日期
            DateTimeFormatter dateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");
            if (request.get("plannedStartDate") != null) {
                try {
                    order.setPlannedStartDate(LocalDate.parse((String) request.get("plannedStartDate"), dateFormatter).atStartOfDay());
                } catch (Exception ignored) { }
            }
            if (request.get("plannedEndDate") != null) {
                try {
                    order.setPlannedEndDate(LocalDate.parse((String) request.get("plannedEndDate"), dateFormatter).atTime(23, 59, 59));
                } catch (Exception ignored) { }
            }

            // ===== 构建工序单价 progressWorkflowJson =====
            // 优先用请求体传入的 processUnitPrices，否则自动从款式工序表（t_style_process）带入
            String progressWorkflowJson = null;
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> processUnitPrices = (List<Map<String, Object>>) request.get("processUnitPrices");

            if (processUnitPrices != null && !processUnitPrices.isEmpty()) {
                // 方式一：请求体直接传入工序单价
                List<Map<String, Object>> nodes = new ArrayList<>();
                for (Map<String, Object> p : processUnitPrices) {
                    String pName = p.get("processName") != null ? String.valueOf(p.get("processName")).trim() : null;
                    if (!StringUtils.hasText(pName)) continue;
                    Map<String, Object> node = new LinkedHashMap<>();
                    node.put("name", pName);
                    if (p.get("processCode") != null) node.put("processCode", String.valueOf(p.get("processCode")).trim());
                    node.put("unitPrice", p.get("unitPrice") != null ? p.get("unitPrice") : 0);
                    nodes.add(node);
                }
                if (!nodes.isEmpty()) {
                    Map<String, Object> workflow = new LinkedHashMap<>();
                    workflow.put("nodes", nodes);
                    progressWorkflowJson = objectMapper.writeValueAsString(workflow);
                    log.info("[OpenAPI] 使用请求体传入工序单价: orderNo={}, 工序数={}", orderNo, nodes.size());
                }
            } else if (style != null) {
                // 方式二：自动从款式工序表（t_style_process）读取工序单价
                LambdaQueryWrapper<StyleProcess> processWrapper = new LambdaQueryWrapper<>();
                processWrapper.eq(StyleProcess::getStyleId, style.getId());
                processWrapper.orderByAsc(StyleProcess::getSortOrder);
                List<StyleProcess> styleProcesses = styleProcessService.list(processWrapper);
                if (styleProcesses != null && !styleProcesses.isEmpty()) {
                    List<Map<String, Object>> nodes = new ArrayList<>();
                    for (StyleProcess sp : styleProcesses) {
                        Map<String, Object> node = new LinkedHashMap<>();
                        node.put("name", sp.getProcessName());
                        if (StringUtils.hasText(sp.getProcessCode())) node.put("processCode", sp.getProcessCode());
                        if (StringUtils.hasText(sp.getProgressStage())) node.put("stage", sp.getProgressStage());
                        node.put("unitPrice", sp.getPrice() != null ? sp.getPrice() : BigDecimal.ZERO);
                        node.put("standardTime", sp.getStandardTime() != null ? sp.getStandardTime() : 0);
                        nodes.add(node);
                    }
                    Map<String, Object> workflow = new LinkedHashMap<>();
                    workflow.put("nodes", nodes);
                    progressWorkflowJson = objectMapper.writeValueAsString(workflow);
                    log.info("[OpenAPI] 自动带入款式工序单价: orderNo={}, styleNo={}, 工序数={}", orderNo, styleNo, nodes.size());
                }
            }
            order.setProgressWorkflowJson(progressWorkflowJson);

            // 保存订单
            productionOrderService.save(order);
            log.info("[OpenAPI] 第三方下单成功: orderNo={}, styleNo={}, quantity={}, 来源={}, 工序单价={}",
                    orderNo, styleNo, quantity, app.getAppName(), progressWorkflowJson != null ? "已配置" : "未配置（款式无工序）");

            // 汇总工序单价信息（用于返回给客户）
            List<Map<String, Object>> processInfo = new ArrayList<>();
            if (StringUtils.hasText(progressWorkflowJson)) {
                try {
                    Map<String, Object> wf = objectMapper.readValue(progressWorkflowJson, new TypeReference<Map<String, Object>>() {});
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> nodes = (List<Map<String, Object>>) wf.get("nodes");
                    if (nodes != null) processInfo = nodes;
                } catch (Exception ignored) { }
            }

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
            result.put("merchandiser", order.getMerchandiser());
            result.put("patternMaker", order.getPatternMaker());
            result.put("productCategory", order.getProductCategory());
            result.put("factoryName", order.getFactoryName());
            result.put("plannedStartDate", order.getPlannedStartDate() != null ? order.getPlannedStartDate().toLocalDate().toString() : null);
            result.put("plannedEndDate", order.getPlannedEndDate() != null ? order.getPlannedEndDate().toLocalDate().toString() : null);
            result.put("expectedShipDate", order.getExpectedShipDate());
            result.put("processUnitPrices", processInfo);
            result.put("processCount", processInfo.size());
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
    @Transactional(rollbackFor = Exception.class)
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
    @Transactional(rollbackFor = Exception.class)
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
                    Integer purchaseQuantity = parseInteger(item.get("purchaseQuantity"));

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
                    purchase.setColor(valueAsString(item.get("color"), order.getColor()));
                    purchase.setSize(valueAsString(item.get("size"), order.getSize()));

                    purchase.setMaterialCode(valueAsString(item.get("materialCode"), null));
                    purchase.setMaterialName(materialName);
                    purchase.setMaterialType(valueAsString(item.get("materialType"), "FABRIC"));
                    purchase.setSpecifications(valueAsString(item.get("specifications"), null));
                    purchase.setUnit(valueAsString(item.get("unit"), "米"));
                    purchase.setPurchaseQuantity(purchaseQuantity);
                    purchase.setArrivedQuantity(parseInteger(item.get("arrivedQuantity")) == null ? 0 : parseInteger(item.get("arrivedQuantity")));
                    purchase.setSupplierName(valueAsString(item.get("supplierName"), app.getAppName()));
                    purchase.setRemark(valueAsString(item.get("remark"), "[OpenAPI批量上传]"));
                    purchase.setStatus(valueAsString(item.get("status"), "pending"));
                    purchase.setSourceType("order");

                    BigDecimal unitPrice = parseDecimal(item.get("unitPrice"));
                    purchase.setUnitPrice(unitPrice == null ? BigDecimal.ZERO : unitPrice);

                    String expectedArrivalDate = valueAsString(item.get("expectedArrivalDate"), null);
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

    // ========== 数据导入 - 款式资料 (DATA_IMPORT / ORDER_SYNC) ==========

    /**
     * 批量上传款式资料
     *
     * 请求体:
     * {
     *   "strict": false,
     *   "styles": [
     *     {
     *       "styleNo": "FZ2026001",
     *       "styleName": "春季连衣裙",
     *       "category": "连衣裙",
     *       "price": 88.5,
     *       "cycle": 15,
     *       "color": "红色,蓝色",
     *       "size": "S,M,L,XL",
     *       "season": "春",
     *       "year": 2026,
     *       "month": 3,
     *       "customer": "客户A",
     *       "description": "2026春季新款",
     *       "plateType": "首单",
     *       "processes": [
     *         { "processName": "裁剪", "processCode": "CUT", "progressStage": "裁剪", "price": 1.5, "standardTime": 120, "sortOrder": 1 },
     *         { "processName": "车缝", "processCode": "SEW", "progressStage": "车缝", "price": 3.0, "standardTime": 300, "sortOrder": 2 }
     *       ]
     *     }
     *   ]
     * }
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> batchCreateStyles(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> styles = (List<Map<String, Object>>) request.get("styles");
            boolean strict = request.get("strict") != null && Boolean.TRUE.equals(request.get("strict"));

            if (styles == null || styles.isEmpty()) {
                throw new IllegalArgumentException("缺少必填参数: styles");
            }
            if (styles.size() > 200) {
                throw new IllegalArgumentException("单次最多上传 200 条款式");
            }

            List<Map<String, Object>> successRecords = new ArrayList<>();
            List<Map<String, Object>> failedRecords = new ArrayList<>();

            for (int index = 0; index < styles.size(); index++) {
                Map<String, Object> item = styles.get(index);
                try {
                    String styleNo = valueAsString(item.get("styleNo"), "").trim();
                    String styleName = valueAsString(item.get("styleName"), "").trim();

                    if (!StringUtils.hasText(styleNo)) {
                        throw new IllegalArgumentException("styleNo 不能为空");
                    }

                    // 检查款号是否已存在
                    StyleInfo existingStyle = styleInfoService.getOne(
                            new LambdaQueryWrapper<StyleInfo>()
                                    .eq(StyleInfo::getStyleNo, styleNo)
                                    .last("LIMIT 1")
                    );
                    if (existingStyle != null) {
                        throw new IllegalArgumentException("款号已存在: " + styleNo);
                    }

                    StyleInfo style = new StyleInfo();
                    style.setStyleNo(styleNo);
                    style.setStyleName(StringUtils.hasText(styleName) ? styleName : styleNo);
                    style.setCategory(valueAsString(item.get("category"), null));
                    style.setColor(valueAsString(item.get("color"), null));
                    style.setSize(valueAsString(item.get("size"), null));
                    style.setSeason(valueAsString(item.get("season"), null));
                    style.setCustomer(valueAsString(item.get("customer"), null));
                    style.setDescription(valueAsString(item.get("description"), "[OpenAPI批量导入]"));
                    style.setPlateType(valueAsString(item.get("plateType"), null));
                    style.setPatternNo(valueAsString(item.get("patternNo"), null));

                    BigDecimal price = parseDecimal(item.get("price"));
                    if (price != null) {
                        style.setPrice(price);
                    }

                    Integer cycle = parseInteger(item.get("cycle"));
                    if (cycle != null) {
                        style.setCycle(cycle);
                    }

                    Integer year = parseInteger(item.get("year"));
                    style.setYear(year != null ? year : LocalDate.now().getYear());

                    Integer month = parseInteger(item.get("month"));
                    style.setMonth(month != null ? month : LocalDate.now().getMonthValue());

                    style.setStatus("ENABLED");
                    style.setCreateTime(LocalDateTime.now());
                    style.setUpdateTime(LocalDateTime.now());

                    boolean saved = styleInfoService.save(style);
                    if (!saved) {
                        throw new RuntimeException("保存款式失败");
                    }

                    // 如果包含工序列表，一起保存
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> processes = (List<Map<String, Object>>) item.get("processes");
                    int processCount = 0;
                    if (processes != null && !processes.isEmpty()) {
                        for (int pi = 0; pi < processes.size(); pi++) {
                            Map<String, Object> proc = processes.get(pi);
                            StyleProcess sp = new StyleProcess();
                            sp.setStyleId(style.getId());
                            sp.setProcessCode(valueAsString(proc.get("processCode"), "P" + (pi + 1)));
                            sp.setProcessName(valueAsString(proc.get("processName"), "工序" + (pi + 1)));
                            sp.setProgressStage(valueAsString(proc.get("progressStage"), null));
                            sp.setMachineType(valueAsString(proc.get("machineType"), null));
                            sp.setSortOrder(parseInteger(proc.get("sortOrder")) != null ? parseInteger(proc.get("sortOrder")) : pi + 1);

                            BigDecimal processPrice = parseDecimal(proc.get("price"));
                            if (processPrice != null) {
                                sp.setPrice(processPrice);
                            }
                            Integer standardTime = parseInteger(proc.get("standardTime"));
                            if (standardTime != null) {
                                sp.setStandardTime(standardTime);
                            }
                            sp.setCreateTime(LocalDateTime.now());
                            sp.setUpdateTime(LocalDateTime.now());
                            styleProcessService.save(sp);
                            processCount++;
                        }
                    }

                    Map<String, Object> successItem = new LinkedHashMap<>();
                    successItem.put("index", index + 1);
                    successItem.put("styleId", style.getId());
                    successItem.put("styleNo", style.getStyleNo());
                    successItem.put("styleName", style.getStyleName());
                    successItem.put("processCount", processCount);
                    successRecords.add(successItem);
                } catch (Exception e) {
                    Map<String, Object> fail = new LinkedHashMap<>();
                    fail.put("index", index + 1);
                    fail.put("styleNo", item.get("styleNo"));
                    fail.put("error", e.getMessage());
                    failedRecords.add(fail);
                    if (strict) {
                        throw new IllegalArgumentException("第 " + (index + 1) + " 条失败: " + e.getMessage());
                    }
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("total", styles.size());
            result.put("successCount", successRecords.size());
            result.put("failedCount", failedRecords.size());
            result.put("strict", strict);
            result.put("successRecords", successRecords);
            result.put("failedRecords", failedRecords);
            result.put("message", failedRecords.isEmpty() ? "款式批量上传成功" : "款式批量上传完成，存在部分失败记录");
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("批量创建款式失败: " + e.getMessage(), e);
        }
    }

    // ========== 数据导入 - 工厂/供应商 (DATA_IMPORT) ==========

    /**
     * 批量上传工厂/供应商
     *
     * 请求体:
     * {
     *   "strict": false,
     *   "factories": [
     *     {
     *       "factoryCode": "GC001",
     *       "factoryName": "金华服装加工厂",
     *       "contactPerson": "张三",
     *       "contactPhone": "13800138000",
     *       "address": "浙江省金华市义乌工业区",
     *       "businessLicense": ""
     *     }
     *   ]
     * }
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> batchCreateFactories(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> factories = (List<Map<String, Object>>) request.get("factories");
            boolean strict = request.get("strict") != null && Boolean.TRUE.equals(request.get("strict"));

            if (factories == null || factories.isEmpty()) {
                throw new IllegalArgumentException("缺少必填参数: factories");
            }
            if (factories.size() > 500) {
                throw new IllegalArgumentException("单次最多上传 500 条工厂记录");
            }

            List<Map<String, Object>> successRecords = new ArrayList<>();
            List<Map<String, Object>> failedRecords = new ArrayList<>();

            for (int index = 0; index < factories.size(); index++) {
                Map<String, Object> item = factories.get(index);
                try {
                    String factoryName = valueAsString(item.get("factoryName"), "").trim();
                    if (!StringUtils.hasText(factoryName)) {
                        throw new IllegalArgumentException("factoryName 不能为空");
                    }

                    // 检查工厂名称是否已存在
                    Factory existing = factoryService.getOne(
                            new LambdaQueryWrapper<Factory>()
                                    .eq(Factory::getFactoryName, factoryName)
                                    .eq(Factory::getDeleteFlag, 0)
                                    .last("LIMIT 1")
                    );
                    if (existing != null) {
                        throw new IllegalArgumentException("工厂名称已存在: " + factoryName);
                    }

                    Factory factory = new Factory();
                    factory.setFactoryName(factoryName);
                    factory.setFactoryCode(valueAsString(item.get("factoryCode"), null));
                    factory.setContactPerson(valueAsString(item.get("contactPerson"), null));
                    factory.setContactPhone(valueAsString(item.get("contactPhone"), null));
                    factory.setAddress(valueAsString(item.get("address"), null));
                    factory.setBusinessLicense(valueAsString(item.get("businessLicense"), null));
                    factory.setStatus("active");
                    factory.setDeleteFlag(0);
                    factory.setCreateTime(LocalDateTime.now());
                    factory.setUpdateTime(LocalDateTime.now());

                    boolean saved = factoryService.save(factory);
                    if (!saved) {
                        throw new RuntimeException("保存工厂记录失败");
                    }

                    Map<String, Object> successItem = new LinkedHashMap<>();
                    successItem.put("index", index + 1);
                    successItem.put("factoryId", factory.getId());
                    successItem.put("factoryCode", factory.getFactoryCode());
                    successItem.put("factoryName", factory.getFactoryName());
                    successRecords.add(successItem);
                } catch (Exception e) {
                    Map<String, Object> fail = new LinkedHashMap<>();
                    fail.put("index", index + 1);
                    fail.put("factoryName", item.get("factoryName"));
                    fail.put("error", e.getMessage());
                    failedRecords.add(fail);
                    if (strict) {
                        throw new IllegalArgumentException("第 " + (index + 1) + " 条失败: " + e.getMessage());
                    }
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("total", factories.size());
            result.put("successCount", successRecords.size());
            result.put("failedCount", failedRecords.size());
            result.put("strict", strict);
            result.put("successRecords", successRecords);
            result.put("failedRecords", failedRecords);
            result.put("message", failedRecords.isEmpty() ? "工厂批量上传成功" : "工厂批量上传完成，存在部分失败记录");
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("批量创建工厂失败: " + e.getMessage(), e);
        }
    }

    // ========== 数据导入 - 员工/工人 (DATA_IMPORT) ==========

    /**
     * 批量上传员工（工人/跟单员等）
     *
     * 注意：密码自动设置为 123456（客户可在系统内修改），角色默认为"普通用户"
     *
     * 请求体:
     * {
     *   "strict": false,
     *   "employees": [
     *     {
     *       "username": "zhangsan",
     *       "name": "张三",
     *       "phone": "13800138001",
     *       "email": "zhangsan@factory.com",
     *       "roleName": "工人"
     *     }
     *   ]
     * }
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> batchCreateEmployees(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> employees = (List<Map<String, Object>>) request.get("employees");
            boolean strict = request.get("strict") != null && Boolean.TRUE.equals(request.get("strict"));

            if (employees == null || employees.isEmpty()) {
                throw new IllegalArgumentException("缺少必填参数: employees");
            }
            if (employees.size() > 500) {
                throw new IllegalArgumentException("单次最多上传 500 条员工记录");
            }

            List<Map<String, Object>> successRecords = new ArrayList<>();
            List<Map<String, Object>> failedRecords = new ArrayList<>();

            for (int index = 0; index < employees.size(); index++) {
                Map<String, Object> item = employees.get(index);
                try {
                    String name = valueAsString(item.get("name"), "").trim();
                    if (!StringUtils.hasText(name)) {
                        throw new IllegalArgumentException("name (姓名) 不能为空");
                    }

                    // 自动生成用户名：如果未提供，使用 "emp_" + 时间戳 + 序号
                    String username = valueAsString(item.get("username"), "").trim();
                    if (!StringUtils.hasText(username)) {
                        username = "emp_" + System.currentTimeMillis() % 100000 + "_" + (index + 1);
                    }

                    // 检查用户名是否已存在
                    User existing = userService.getOne(
                            new LambdaQueryWrapper<User>()
                                    .eq(User::getUsername, username)
                                    .last("LIMIT 1")
                    );
                    if (existing != null) {
                        throw new IllegalArgumentException("用户名已存在: " + username);
                    }

                    User user = new User();
                    user.setUsername(username);
                    user.setName(name);
                    user.setPassword("123456"); // 默认密码，UserService.saveUser 内部会加密
                    user.setPhone(valueAsString(item.get("phone"), null));
                    user.setEmail(valueAsString(item.get("email"), null));
                    user.setRoleName(valueAsString(item.get("roleName"), "普通用户"));
                    user.setTenantId(app.getTenantId());
                    user.setStatus("active");
                    user.setRegistrationStatus("ACTIVE");
                    user.setCreateTime(LocalDateTime.now());
                    user.setUpdateTime(LocalDateTime.now());

                    boolean saved = userService.saveUser(user);
                    if (!saved) {
                        throw new RuntimeException("保存员工记录失败");
                    }

                    Map<String, Object> successItem = new LinkedHashMap<>();
                    successItem.put("index", index + 1);
                    successItem.put("userId", user.getId());
                    successItem.put("username", user.getUsername());
                    successItem.put("name", user.getName());
                    successItem.put("defaultPassword", "123456");
                    successRecords.add(successItem);
                } catch (Exception e) {
                    Map<String, Object> fail = new LinkedHashMap<>();
                    fail.put("index", index + 1);
                    fail.put("name", item.get("name"));
                    fail.put("username", item.get("username"));
                    fail.put("error", e.getMessage());
                    failedRecords.add(fail);
                    if (strict) {
                        throw new IllegalArgumentException("第 " + (index + 1) + " 条失败: " + e.getMessage());
                    }
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("total", employees.size());
            result.put("successCount", successRecords.size());
            result.put("failedCount", failedRecords.size());
            result.put("strict", strict);
            result.put("successRecords", successRecords);
            result.put("failedRecords", failedRecords);
            result.put("message", failedRecords.isEmpty() ? "员工批量上传成功" : "员工批量上传完成，存在部分失败记录");
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("批量创建员工失败: " + e.getMessage(), e);
        }
    }

    // ========== 数据导入 - 工序模板 (DATA_IMPORT) ==========

    /**
     * 批量上传工序（按款号关联）
     *
     * 请求体:
     * {
     *   "strict": false,
     *   "styleNo": "FZ2026001",
     *   "processes": [
     *     {
     *       "processCode": "CUT",
     *       "processName": "裁剪",
     *       "progressStage": "裁剪",
     *       "machineType": "裁剪机",
     *       "standardTime": 120,
     *       "price": 1.5,
     *       "sortOrder": 1
     *     }
     *   ]
     * }
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> batchCreateStyleProcesses(TenantApp app, String body) {
        try {
            Map<String, Object> request = objectMapper.readValue(body, new TypeReference<Map<String, Object>>() {});
            String styleNo = valueAsString(request.get("styleNo"), "").trim();
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> processes = (List<Map<String, Object>>) request.get("processes");
            boolean strict = request.get("strict") != null && Boolean.TRUE.equals(request.get("strict"));

            if (!StringUtils.hasText(styleNo)) {
                throw new IllegalArgumentException("缺少必填参数: styleNo");
            }
            if (processes == null || processes.isEmpty()) {
                throw new IllegalArgumentException("缺少必填参数: processes");
            }
            if (processes.size() > 100) {
                throw new IllegalArgumentException("单个款式最多上传 100 道工序");
            }

            // 查找款式
            StyleInfo style = styleInfoService.getOne(
                    new LambdaQueryWrapper<StyleInfo>()
                            .eq(StyleInfo::getStyleNo, styleNo)
                            .last("LIMIT 1")
            );
            if (style == null) {
                throw new IllegalArgumentException("款号不存在: " + styleNo + "（请先上传款式资料）");
            }

            List<Map<String, Object>> successRecords = new ArrayList<>();
            List<Map<String, Object>> failedRecords = new ArrayList<>();

            for (int index = 0; index < processes.size(); index++) {
                Map<String, Object> item = processes.get(index);
                try {
                    String processName = valueAsString(item.get("processName"), "").trim();
                    if (!StringUtils.hasText(processName)) {
                        throw new IllegalArgumentException("processName 不能为空");
                    }

                    StyleProcess sp = new StyleProcess();
                    sp.setStyleId(style.getId());
                    sp.setProcessCode(valueAsString(item.get("processCode"), "P" + (index + 1)));
                    sp.setProcessName(processName);
                    sp.setProgressStage(valueAsString(item.get("progressStage"), null));
                    sp.setMachineType(valueAsString(item.get("machineType"), null));
                    sp.setSortOrder(parseInteger(item.get("sortOrder")) != null ? parseInteger(item.get("sortOrder")) : index + 1);

                    BigDecimal processPrice = parseDecimal(item.get("price"));
                    if (processPrice != null) {
                        sp.setPrice(processPrice);
                    }
                    Integer standardTime = parseInteger(item.get("standardTime"));
                    if (standardTime != null) {
                        sp.setStandardTime(standardTime);
                    }
                    sp.setCreateTime(LocalDateTime.now());
                    sp.setUpdateTime(LocalDateTime.now());

                    boolean saved = styleProcessService.save(sp);
                    if (!saved) {
                        throw new RuntimeException("保存工序记录失败");
                    }

                    Map<String, Object> successItem = new LinkedHashMap<>();
                    successItem.put("index", index + 1);
                    successItem.put("processId", sp.getId());
                    successItem.put("processCode", sp.getProcessCode());
                    successItem.put("processName", sp.getProcessName());
                    successRecords.add(successItem);
                } catch (Exception e) {
                    Map<String, Object> fail = new LinkedHashMap<>();
                    fail.put("index", index + 1);
                    fail.put("processName", item.get("processName"));
                    fail.put("error", e.getMessage());
                    failedRecords.add(fail);
                    if (strict) {
                        throw new IllegalArgumentException("第 " + (index + 1) + " 条失败: " + e.getMessage());
                    }
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("styleNo", styleNo);
            result.put("styleId", style.getId());
            result.put("total", processes.size());
            result.put("successCount", successRecords.size());
            result.put("failedCount", failedRecords.size());
            result.put("strict", strict);
            result.put("successRecords", successRecords);
            result.put("failedRecords", failedRecords);
            result.put("message", failedRecords.isEmpty() ? "工序批量上传成功" : "工序批量上传完成，存在部分失败记录");
            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("批量创建工序失败: " + e.getMessage(), e);
        }
    }

    private Integer parseInteger(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        String text = String.valueOf(value).trim();
        if (!StringUtils.hasText(text)) {
            return null;
        }
        try {
            return Integer.parseInt(text);
        } catch (Exception e) {
            return null;
        }
    }

    private BigDecimal parseDecimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal) {
            return (BigDecimal) value;
        }
        if (value instanceof Number) {
            return BigDecimal.valueOf(((Number) value).doubleValue());
        }
        String text = String.valueOf(value).trim();
        if (!StringUtils.hasText(text)) {
            return null;
        }
        try {
            return new BigDecimal(text);
        } catch (Exception e) {
            return null;
        }
    }

    private String valueAsString(Object value, String defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        String text = String.valueOf(value).trim();
        if (!StringUtils.hasText(text)) {
            return defaultValue;
        }
        return text;
    }
}
