package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.orchestration.ProductionOrderExportOrchestrator;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import com.fashion.supplychain.production.orchestration.FactoryCapacityOrchestrator;
import com.fashion.supplychain.production.orchestration.OrderHealthScoreOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 生产订单Controller
 * 核心CRUD操作
 *
 * 其他操作已拆分到：
 * - ProductionOrderOperationController: 订单操作（报废、完成、关闭、工序委派）
 * - ProductionOrderProgressController: 进度相关（更新进度、物料到位率、工作流锁定/回退、采购确认）
 * - ProductionOrderNodeController: 节点操作记录、工序状态查询
 */
@Slf4j
@RestController
@RequestMapping({"/api/production/order", "/api/production/orders"})
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
@Tag(name = "生产订单", description = "生产订单的创建、查询、更新、删除、导出等操作")
public class ProductionOrderController {
    private final ProductionOrderOrchestrator productionOrderOrchestrator;
    private final ProductionOrderService productionOrderService;
    private final FactoryCapacityOrchestrator factoryCapacityOrchestrator;
    private final ProductionOrderExportOrchestrator exportOrchestrator;
    private final OrderHealthScoreOrchestrator orderHealthScoreOrchestrator;
    private final com.fashion.supplychain.production.service.UrgeRecordService urgeRecordService;
    private final StyleInfoService styleInfoService;
    private final com.fashion.supplychain.style.service.SecondaryProcessService secondaryProcessService;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    /**
     * 导出生产订单列表为Excel
     */
    @GetMapping("/export-excel")
    @Operation(summary = "导出生产订单Excel", description = "导出生产订单列表为Excel文件，支持按条件筛选")
    public ResponseEntity<byte[]> exportExcel(@Parameter(description = "查询参数") @RequestParam Map<String, Object> params) {
        byte[] data = exportOrchestrator.exportProductionOrders(params);
        String fileName = "生产订单导出_" + System.currentTimeMillis() + ".xlsx";
        String encodedName = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodedName)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(data.length)
                .body(data);
    }

    /**
     * 【新版统一查询】分页查询生产订单列表
     * 支持参数：
     * - id: 按ID查询（返回单条）
     * - orderNo: 按订单号查询（模糊匹配）
     * - status: 按状态查询
     * - styleNo: 按款号查询
     * - factoryId: 按工厂查询
     * - page, size: 分页参数
     *
     * @since 2026-02-01 优化版本
     */
    @GetMapping("/list")
    @Operation(summary = "查询生产订单列表", description = "分页查询生产订单列表，支持按订单号、状态、款号、工厂等条件筛选")
    public Result<?> list(@Parameter(description = "查询参数（id/orderNo/status/styleNo/factoryId/page/size）") @RequestParam Map<String, Object> params) {
        // 如果指定了id参数，直接返回单条详情（优化：减少前端判断）
        if (params.containsKey("id") && params.get("id") != null) {
            String id = params.get("id").toString();
            ProductionOrder detail = productionOrderOrchestrator.getDetailById(id);
            return Result.success(detail);
        }

        // 如果指定了orderNo且没有其他筛选条件，优化为精确查询
        if (params.containsKey("orderNo") && params.size() <= 3) { // orderNo + page + size
            String orderNo = params.get("orderNo").toString();
            // 如果看起来是完整订单号（如PO开头），尝试精确匹配
            if ((orderNo.startsWith("PO") || orderNo.startsWith("CUT")) && orderNo.length() >= 10) {
                try {
                    ProductionOrder detail = productionOrderOrchestrator.getDetailByOrderNo(orderNo);
                    if (detail != null) {
                        // 返回分页格式以保持前端兼容
                        // 创建伪分页对象，包装单个订单为records数组
                        // 注入 coverImage/styleImage，修复小程序扫码确认页款式图不显示问题
                        java.util.Map<String, Object> enriched = objectMapper
                                .convertValue(detail, new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {});
                        // 优先用 styleId 查款式信息；若 styleId 为空则用 styleNo 兜底（老订单 styleId 可能为 null）
                        StyleInfo si = null;
                        if (StringUtils.hasText(detail.getStyleId())) {
                            si = styleInfoService.getById(detail.getStyleId());
                        } else if (StringUtils.hasText(detail.getStyleNo())) {
                            si = styleInfoService.lambdaQuery()
                                    .eq(StyleInfo::getStyleNo, detail.getStyleNo())
                                    .last("LIMIT 1")
                                    .one();
                        }
                        if (si != null) {
                            if (StringUtils.hasText(si.getCover())) {
                                enriched.put("coverImage", si.getCover());
                                enriched.put("styleImage", si.getCover());
                            }
                            if (StringUtils.hasText(si.getDescription())) {
                                enriched.put("description", si.getDescription());
                            }
                        }
                        if (StringUtils.hasText(detail.getStyleId())) {
                            try {
                                java.util.List<com.fashion.supplychain.style.entity.SecondaryProcess> processes =
                                        secondaryProcessService.listByStyleId(Long.valueOf(detail.getStyleId()));
                                if (processes != null && !processes.isEmpty()) {
                                    enriched.put("secondaryProcesses", processes);
                                }
                            } catch (Exception spEx) {
                                log.warn("查询二次工艺失败: styleId={}", detail.getStyleId(), spEx);
                            }
                        }
                        java.util.Map<String, Object> pageResult = new java.util.HashMap<>();
                        pageResult.put("records", java.util.Collections.singletonList(enriched));
                        pageResult.put("total", 1L);
                        pageResult.put("size", 1L);
                        pageResult.put("current", 1L);
                        pageResult.put("pages", 1L);
                        return Result.success(pageResult);
                    }
                } catch (java.util.NoSuchElementException e) {
                    log.debug("[Order] 精确查询订单不存在: orderNo={}", orderNo);
                } catch (Exception e) {
                    log.error("精确查询订单异常: orderNo={}", orderNo, e);
                    throw e;
                }
            }
        }

        IPage<ProductionOrder> page = productionOrderOrchestrator.queryPage(params);
        return Result.success(page);
    }

    @PostMapping("/list")
    public Result<?> listPost(@RequestBody(required = false) Map<String, Object> body) {
        java.util.Map<String, Object> params = new java.util.HashMap<>();
        if (body != null) {
            Object filters = body.get("filters");
            if (filters instanceof Map) {
                params.putAll((Map<String, Object>) filters);
            }
            params.putAll(body);
        }
        params.remove("filters");
        IPage<ProductionOrder> page = productionOrderOrchestrator.queryPage(params);
        return Result.success(page);
    }

    /**
     * 获取全局订单统计数据（用于顶部统计卡片）
     * 返回符合筛选条件的订单统计，支持按工厂、关键词、状态筛选
     * - totalOrders: 总订单数
     * - totalQuantity: 总数量
     * - delayedOrders: 延期订单数
     * - delayedQuantity: 延期订单数量
     * - todayOrders: 当天下单数
     * - todayQuantity: 当天下单数量
     *
     * @param params 查询参数（keyword, status, factoryName等，与list接口参数一致）
     * @return 统计数据
     * @since 2026-02-05 初始版本
     * @since 2026-02-06 增加筛选参数支持
     * @since 2026-02-09 增加当天下单统计
     */
    @GetMapping("/stats")
    public Result<?> getStats(@RequestParam(required = false) Map<String, Object> params) {
        // 工厂账号只能查看自己工厂的统计数据
        String ctxFactoryId = UserContext.factoryId();
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            if (ctxFactoryId == null) {
                return Result.success(java.util.Collections.emptyMap());
            }
            params = params != null ? new java.util.HashMap<>(params) : new java.util.HashMap<>();
            params.put("factoryId", ctxFactoryId);
        }
        return Result.success(productionOrderOrchestrator.getGlobalStats(params));
    }

    /**
     * 根据ID查询生产订单详情
     * 推荐使用：GET /list?id={id} （统一查询接口）
     */
    @GetMapping("/detail/{id}")
    public Result<?> detail(@PathVariable String id) {
        ProductionOrder productionOrder = productionOrderOrchestrator.getDetailById(id);
        if (productionOrder != null) {
            TenantAssert.assertBelongsToCurrentTenant(productionOrder.getTenantId(), "生产订单");
        }
        if (productionOrder != null && StringUtils.hasText(productionOrder.getStyleId())) {
            StyleInfo si = styleInfoService.getById(productionOrder.getStyleId());
            if (si != null && StringUtils.hasText(si.getCover())) {
                java.util.Map<String, Object> enriched = objectMapper
                        .convertValue(productionOrder, new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {});
                enriched.put("coverImage", si.getCover());
                enriched.put("styleImage", si.getCover());
                return Result.success(enriched);
            }
        }
        return Result.success(productionOrder);
    }

    /**
     * 获取订单流程信息
     */
    @GetMapping("/flow/{id}")
    public Result<?> flow(@PathVariable String id) {
        ProductionOrder order = productionOrderService.getById(id);
        if (order != null) {
            TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "生产订单");
        }
        return Result.success(productionOrderOrchestrator.getOrderFlow(id));
    }

    /**
     * 复制生产订单（同款不同色/不同码等场景）
     */
    @PostMapping("/copy/{id}")
    @PreAuthorize("isAuthenticated()")
    public Result<?> copyOrder(@PathVariable String id) {
        TenantAssert.assertTenantContext();
        ProductionOrder source = productionOrderService.getById(id);
        if (source == null) {
            return Result.notFound("源订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(source.getTenantId(), "生产订单");
        ProductionOrder copy = new ProductionOrder();
        copy.setStyleNo(source.getStyleNo());
        copy.setStyleName(source.getStyleName());
        copy.setFactoryId(source.getFactoryId());
        copy.setFactoryName(source.getFactoryName());
        copy.setOrderQuantity(source.getOrderQuantity());
        copy.setProductCategory(source.getProductCategory());
        copy.setMerchandiser(source.getMerchandiser());
        copy.setCompany(source.getCompany());
        copy.setPatternMaker(source.getPatternMaker());
        copy.setUrgencyLevel(source.getUrgencyLevel());
        copy.setOrderDetails(source.getOrderDetails());
        copy.setProgressWorkflowJson(source.getProgressWorkflowJson());
        copy.setNodeOperations(source.getNodeOperations());
        copy.setRemarks("复制自订单: " + source.getOrderNo());
        copy.setStatus("pending");
        copy.setProductionProgress(0);
        return upsert(copy);
    }

    /**
     * 保存或更新生产订单
     */
    @PostMapping
    public Result<?> add(@RequestBody ProductionOrder productionOrder) {
        // ✅ 添加接收数据日志，便于排查字段丢失问题
        log.info("Creating order - received fields: merchandiser={}, company={}, category={}, patternMaker={}, orderDetails={}, workflow={}",
                productionOrder.getMerchandiser(),
                productionOrder.getCompany(),
                productionOrder.getProductCategory(),
                productionOrder.getPatternMaker(),
                productionOrder.getOrderDetails() != null ? "present" : "null",
                productionOrder.getProgressWorkflowJson() != null ? "present" : "null");
        return upsert(productionOrder);
    }

    /**
     * 更新生产订单
     */
    @PutMapping
    public Result<?> update(@RequestBody ProductionOrder productionOrder) {
        return upsert(productionOrder);
    }

    /**
     * 根据ID删除生产订单（RESTful标准）— 非管理员需审批
     */
    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @DeleteMapping("/{id}")
    public Result<?> deleteById(@PathVariable String id,
                                @RequestParam(required = false) String reason) {
        java.util.Map<String, Object> result = productionOrderOrchestrator.deleteByIdWithApproval(id, reason);
        if (Boolean.TRUE.equals(result.get("needApproval"))) {
            return Result.success(result);  // 审批申请已提交，前端展示"等待审批"
        }
        return Result.successMessage("删除成功");
    }

    /**
     * 快速编辑订单（备注、预计出货日期、工序数据等）
     */
    @PutMapping("/quick-edit")
    public Result<?> quickEdit(@RequestBody Map<String, Object> payload) {
        Object idObj = payload.get("id");
        String id = idObj != null ? String.valueOf(idObj).trim() : null;
        if (id == null || id.isEmpty()) {
            return Result.badRequest("缺少id参数");
        }

        ProductionOrder order = productionOrderService.getById(id);
        if (order == null) {
            return Result.notFound("订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "订单");

        try {
            boolean success = productionOrderOrchestrator.quickEdit(payload);
            return success ? Result.success("更新成功") : Result.fail("更新失败");
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    @PutMapping("/update-basic-info")
    public Result<?> updateBasicInfo(@RequestBody Map<String, Object> payload) {
        Object idObj = payload.get("id");
        String id = idObj != null ? String.valueOf(idObj).trim() : null;
        if (id == null || id.isEmpty()) {
            return Result.badRequest("缺少id参数");
        }

        ProductionOrder order = productionOrderService.getById(id);
        if (order == null) {
            return Result.notFound("订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "订单");

        try {
            int syncedCount = productionOrderOrchestrator.updateBasicInfo(payload);
            return Result.success(java.util.Map.of(
                    "syncedCount", syncedCount,
                    "message", syncedCount > 0 ? "已同步" + syncedCount + "条下游记录" : "更新成功"
            ));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.fail(e.getMessage());
        }
    }

    @PostMapping("/urge")
    public Result<?> urge(@RequestBody Map<String, Object> payload) {
        String orderId = payload == null ? null : String.valueOf(payload.getOrDefault("orderId", "")).trim();
        String remark = payload != null ? (String) payload.getOrDefault("remark", "") : "";
        if (!StringUtils.hasText(orderId)) {
            return Result.badRequest("缺少orderId参数");
        }

        try {
            com.fashion.supplychain.production.entity.UrgeRecord record = productionOrderOrchestrator.urge(orderId, remark);
            com.fashion.supplychain.production.entity.ProductionOrder order = productionOrderService.getById(orderId);
            if (order == null) {
                return Result.notFound("订单不存在");
            }
            TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "生产订单");
            Integer urgeCount = order.getUrgeCount();
            return Result.success(Map.of(
                    "message", "催单通知已发送",
                    "urgeRecordId", record.getId(),
                    "urgeCount", urgeCount
            ));
        } catch (IllegalArgumentException e) {
            log.warn("[urge] 催单失败 orderId={} msg={}", orderId, e.getMessage());
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            log.error("[urge] 催单异常 orderId={}", orderId, e);
            return Result.fail("催单通知发送失败");
        }
    }

    @PostMapping("/urge/reply")
    public Result<?> urgeReply(@RequestBody Map<String, Object> payload) {
        Object urgeRecordIdObj = payload == null ? null : payload.get("urgeRecordId");
        String urgeRecordId = urgeRecordIdObj != null ? String.valueOf(urgeRecordIdObj).trim() : null;
        if (!StringUtils.hasText(urgeRecordId)) {
            return Result.badRequest("缺少urgeRecordId参数");
        }

        com.fashion.supplychain.production.entity.UrgeRecord record = urgeRecordService.getById(urgeRecordId);
        if (record == null) {
            return Result.notFound("催单记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(record.getTenantId(), "催单记录");

        try {
            productionOrderOrchestrator.urgeReply(payload);
            return Result.success("回复成功");
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    @PostMapping("/urge/check-urged")
    public Result<?> checkUrged(@RequestBody Map<String, Object> payload) {
        if (payload == null) {
            return Result.success(Map.of("urgedOrderIds", List.of()));
        }
        Object idsObj = payload.get("orderIds");
        @SuppressWarnings("unchecked")
        List<String> orderIds = idsObj instanceof List ? (List<String>) idsObj : null;
        if (orderIds == null || orderIds.isEmpty()) {
            return Result.success(Map.of("urgedOrderIds", List.of()));
        }
        Long tenantId = UserContext.tenantId();
        java.util.Set<String> urgedOrderIds = urgeRecordService.findUrgedOrderIds(tenantId, orderIds);
        return Result.success(Map.of("urgedOrderIds", urgedOrderIds));
    }

    /**
     * 批量查询订单健康度评分（0-100，三维度加权：进度/交期/物料）
     */
    @PostMapping("/health-scores")
    public Result<Map<String, com.fashion.supplychain.production.dto.response.OrderHealthScoreDTO>> healthScores(@RequestBody Map<String, Object> payload) {
        List<String> ids = null;
        if (payload != null) {
            Object idsObj = payload.get("orderIds");
            @SuppressWarnings("unchecked")
            List<String> castIds = idsObj instanceof List ? (List<String>) idsObj : null;
            ids = castIds;
        }
        if (ids != null && !ids.isEmpty()) {
            Long tenantId = UserContext.tenantId();
            ids = productionOrderService.lambdaQuery()
                    .in(ProductionOrder::getId, ids)
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .list()
                    .stream()
                    .map(ProductionOrder::getId)
                    .toList();
        }
        return Result.success(orderHealthScoreOrchestrator.batchCalculateHealth(ids));
    }

    private Result<?> upsert(ProductionOrder productionOrder) {
        productionOrderOrchestrator.saveOrUpdateOrder(productionOrder);
        if (productionOrder != null && StringUtils.hasText(productionOrder.getId())) {
            ProductionOrder detail = productionOrderOrchestrator.getDetailById(productionOrder.getId());
            return Result.success(detail != null ? detail : productionOrder);
        }
        return Result.success(productionOrder);
    }

    /**
     * 工厂产能雷达——按工厂汇总进行中订单信息
     * 返回各工厂的：订单数、总件数、高风险数、已逾期数
     */
    @GetMapping("/factory-capacity")
    public Result<List<FactoryCapacityOrchestrator.FactoryCapacityItem>> getFactoryCapacity() {
        // 工厂账号不可查看工厂产能雷达（属于租户级全局数据）
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            return Result.success(java.util.Collections.emptyList());
        }
        return Result.success(factoryCapacityOrchestrator.getFactoryCapacity());
    }

    /**
     * 外发工厂统计（对齐 PC 端 ExternalFactory FactorySidebar 7-Tag）
     * 返回每个外发工厂的：订单数/件数/款数/进行中/已完成/逾期/预警
     */
    @GetMapping("/external-factory-stats")
    @Operation(summary = "外发工厂统计", description = "按外发工厂分组聚合订单统计，对齐 PC 端外发工厂页面工厂汇总卡片")
    public Result<List<com.fashion.supplychain.production.dto.ExternalFactoryStatsVO>> getExternalFactoryStats() {
        return Result.success(productionOrderOrchestrator.calcExternalFactoryStats());
    }

    @GetMapping("/{id}/timeline")
    @PreAuthorize("isAuthenticated()")
    public Result<?> timeline(@PathVariable String id) {
        TenantAssert.assertTenantContext();
        ProductionOrder order = productionOrderService.getById(id);
        if (order == null) {
            return Result.notFound("订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "生产订单");
        String remarks = order.getRemarks();
        java.util.List<java.util.Map<String, String>> entries = new java.util.ArrayList<>();
        if (StringUtils.hasText(remarks)) {
            String[] lines = remarks.split("\n");
            for (String line : lines) {
                line = line.trim();
                if (line.isEmpty()) {
                    continue;
                }
                java.util.Map<String, String> entry = new java.util.LinkedHashMap<>();
                if (line.startsWith("[")) {
                    int endBracket = line.indexOf("]");
                    if (endBracket > 0) {
                        entry.put("time", line.substring(1, endBracket));
                        String rest = line.substring(endBracket + 1).trim();
                        String[] parts = rest.split("-");
                        if (parts.length >= 1) entry.put("operator", parts[0].trim());
                        if (parts.length >= 2) entry.put("action", parts[1].trim());
                        if (parts.length >= 3) {
                            StringBuilder detail = new StringBuilder();
                            for (int i = 2; i < parts.length; i++) {
                                if (detail.length() > 0) detail.append("-");
                                detail.append(parts[i].trim());
                            }
                            entry.put("detail", detail.toString());
                        }
                    }
                } else {
                    entry.put("raw", line);
                }
                entries.add(entry);
            }
        }
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("orderId", order.getId());
        result.put("orderNo", order.getOrderNo());
        result.put("status", order.getStatus());
        result.put("actualStartDate", order.getActualStartDate());
        result.put("actualEndDate", order.getActualEndDate());
        result.put("timeline", entries);
        return Result.success(result);
    }
}
