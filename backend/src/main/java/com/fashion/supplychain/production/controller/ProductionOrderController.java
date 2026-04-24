package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.orchestration.ProductionOrderExportOrchestrator;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import com.fashion.supplychain.production.orchestration.FactoryCapacityOrchestrator;
import com.fashion.supplychain.production.orchestration.OrderHealthScoreOrchestrator;
import com.fashion.supplychain.production.orchestration.SysNoticeOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
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
public class ProductionOrderController {
    private final ProductionOrderOrchestrator productionOrderOrchestrator;
    private final ProductionOrderService productionOrderService;
    private final ProductionProcessTrackingOrchestrator processTrackingOrchestrator;
    private final FactoryCapacityOrchestrator factoryCapacityOrchestrator;
    private final ProductionOrderExportOrchestrator exportOrchestrator;
    private final OrderHealthScoreOrchestrator orderHealthScoreOrchestrator;
    private final SysNoticeOrchestrator sysNoticeOrchestrator;
    private final StyleInfoService styleInfoService;
    private final com.fashion.supplychain.style.service.SecondaryProcessService secondaryProcessService;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    /**
     * 导出生产订单列表为Excel
     */
    @GetMapping("/export-excel")
    public ResponseEntity<byte[]> exportExcel(@RequestParam Map<String, Object> params) {
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
    public Result<?> list(@RequestParam Map<String, Object> params) {
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
            if (orderNo.startsWith("PO") && orderNo.length() >= 10) {
                try {
                    ProductionOrder detail = productionOrderOrchestrator.getDetailByOrderNo(orderNo);
                    if (detail != null) {
                        // 返回分页格式以保持前端兼容
                        // 创建伪分页对象，包装单个订单为records数组
                        // 注入 coverImage/styleImage，修复小程序扫码确认页款式图不显示问题
                        java.util.Map<String, Object> enriched = objectMapper
                                .convertValue(detail, new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {});
                        if (StringUtils.hasText(detail.getStyleId())) {
                            StyleInfo si = styleInfoService.getById(detail.getStyleId());
                            if (si != null) {
                                if (StringUtils.hasText(si.getCover())) {
                                    enriched.put("coverImage", si.getCover());
                                    enriched.put("styleImage", si.getCover());
                                }
                                if (StringUtils.hasText(si.getDescription())) {
                                    enriched.put("description", si.getDescription());
                                }
                            }
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
                    // 订单不存在，继续走分页查询
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
        return Result.success(productionOrderOrchestrator.getGlobalStats(params));
    }

    /**
     * 根据ID查询生产订单详情
     * 推荐使用：GET /list?id={id} （统一查询接口）
     */
    @GetMapping("/detail/{id}")
    public Result<?> detail(@PathVariable String id) {
        ProductionOrder productionOrder = productionOrderOrchestrator.getDetailById(id);
        // 注入 coverImage/styleImage，修复小程序扫码确认页款式图不显示问题（UUID路径）
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
            return Result.fail("源订单不存在");
        }
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
        String id = (String) payload.get("id");
        if (id == null || id.trim().isEmpty()) {
            return Result.fail("缺少id参数");
        }

        ProductionOrder order = productionOrderService.getById(id);
        if (order == null) {
            return Result.fail("订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "订单");

        Object clientVersion = payload.get("version");
        if (clientVersion != null) {
            int expected = Integer.parseInt(String.valueOf(clientVersion));
            int actual = order.getVersion() != null ? order.getVersion() : 0;
            if (expected != actual) {
                return Result.fail("订单已被其他人修改，请刷新后重试");
            }
        }

        // 更新备注
        if (payload.containsKey("remarks")) {
            String remarks = (String) payload.get("remarks");
            order.setRemarks(remarks);
        }

        // 更新预计出货日期
        if (payload.containsKey("expectedShipDate")) {
            String expectedShipDate = (String) payload.get("expectedShipDate");
            if (expectedShipDate != null && !expectedShipDate.isEmpty()) {
                order.setExpectedShipDate(java.time.LocalDate.parse(expectedShipDate));
            } else {
                order.setExpectedShipDate(null);
            }
        }

        // 更新工序数据（progressWorkflowJson）
        boolean workflowUpdated = false;
        if (payload.containsKey("progressWorkflowJson")) {
            String progressWorkflowJson = (String) payload.get("progressWorkflowJson");
            order.setProgressWorkflowJson(progressWorkflowJson);
            workflowUpdated = true;
        }

        // 更新紧急程度
        if (payload.containsKey("urgencyLevel")) {
            String urgencyLevel = (String) payload.get("urgencyLevel");
            order.setUrgencyLevel(StringUtils.hasText(urgencyLevel) ? urgencyLevel : "normal");
        }

        boolean success = productionOrderService.updateById(order);

        // 工序数据变更时，同步更新工序跟踪表中的单价（解决单价不同步问题）
        if (success && workflowUpdated) {
            try {
                int synced = processTrackingOrchestrator.syncUnitPrices(id);
                if (synced > 0) {
                    return Result.success("更新成功，已同步" + synced + "条工序跟踪记录的单价");
                }
            } catch (Exception e) {
                // 同步失败不影响主流程，记录日志
                org.slf4j.LoggerFactory.getLogger(getClass()).warn("同步工序跟踪单价失败: {}", e.getMessage());
            }
        }

        // 催单通知：告知跟单员/工厂更新了预计出货日期
        if (success && Boolean.TRUE.equals(payload.get("sendUrgeNotice"))) {
            try { sysNoticeOrchestrator.send(order.getOrderNo(), "urge_order"); }
            catch (Exception e) { log.warn("[quickEdit] 催单通知发送失败: {}", e.getMessage()); }
        }

        return success ? Result.success("更新成功") : Result.fail("更新失败");
    }

    @PostMapping("/urge")
    public Result<?> urge(@RequestBody Map<String, Object> payload) {
        String orderId = payload == null ? null : String.valueOf(payload.getOrDefault("orderId", "")).trim();
        if (!StringUtils.hasText(orderId)) {
            return Result.fail("缺少orderId参数");
        }

        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            return Result.fail("订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "订单");

        if (!StringUtils.hasText(order.getMerchandiser())) {
            return Result.fail("该订单未设置跟单员，无法发送催单通知");
        }

        try {
            sysNoticeOrchestrator.send(order.getOrderNo(), "urge_order");
            return Result.successMessage("催单通知已发送");
        } catch (IllegalArgumentException e) {
            log.warn("[urge] 催单失败 orderId={} msg={}", orderId, e.getMessage());
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            log.error("[urge] 催单异常 orderId={}", orderId, e);
            return Result.fail("催单通知发送失败");
        }
    }

    /**
     * 批量查询订单健康度评分（0-100，三维度加权：进度/交期/物料）
     */
    @PostMapping("/health-scores")
    public Result<Map<String, com.fashion.supplychain.production.dto.response.OrderHealthScoreDTO>> healthScores(@RequestBody Map<String, Object> payload) {
        @SuppressWarnings("unchecked")
        List<String> ids = (List<String>) payload.get("orderIds");
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
        return Result.success(factoryCapacityOrchestrator.getFactoryCapacity());
    }
}
