package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.dto.ProductionOrderDTO;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderDtoConverter;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

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
@RequestMapping("/api/production/order")
@PreAuthorize("isAuthenticated()")
public class ProductionOrderController {

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderDtoConverter productionOrderDtoConverter;

    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

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
                        java.util.Map<String, Object> pageResult = new java.util.HashMap<>();
                        pageResult.put("records", java.util.Collections.singletonList(detail));
                        pageResult.put("total", 1L);
                        pageResult.put("size", 1L);
                        pageResult.put("current", 1L);
                        pageResult.put("pages", 1L);
                        return Result.success(pageResult);
                    }
                } catch (java.util.NoSuchElementException e) {
                    // 订单不存在，继续走分页查询（可能是模糊匹配或其他查询方式）
                }
            }
        }

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
        return Result.success(productionOrder);
    }

    /**
     * 根据订单号查询生产订单详情（支持扫码场景）
     *
     * @deprecated 已废弃，请使用 GET /list?orderNo={orderNo}
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @GetMapping("/by-order-no/{orderNo}")
    public Result<?> getByOrderNo(@PathVariable String orderNo) {
        // 内部转发到新接口
        java.util.Map<String, Object> params = new java.util.HashMap<>();
        params.put("orderNo", orderNo);
        return list(params);
    }

    /**
     * 根据ID查询生产订单详情（DTO版本，不包含敏感字段）
     *
     * @deprecated 已废弃，请使用 GET /detail/{id} 并在前端过滤字段
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @GetMapping("/detail-dto/{id}")
    public Result<ProductionOrderDTO> detailDTO(@PathVariable String id) {
        ProductionOrder productionOrder = productionOrderOrchestrator.getDetailById(id);
        ProductionOrderDTO dto = productionOrderDtoConverter.toDTO(productionOrder);
        return Result.success(dto);
    }

    /**
     * 获取订单流程信息
     */
    @GetMapping("/flow/{id}")
    public Result<?> flow(@PathVariable String id) {
        return Result.success(productionOrderOrchestrator.getOrderFlow(id));
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
     * 保存或更新生产订单（兼容旧版本）
     *
     * @deprecated 已废弃，请使用 POST /api/production/order（新增）或 PUT /api/production/order（更新）
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @PostMapping("/save")
    public Result<?> save(@RequestBody ProductionOrder productionOrder) {
        return upsert(productionOrder);
    }

    /**
     * 根据ID删除生产订单（RESTful标准）
     */
    @DeleteMapping("/{id}")
    public Result<?> deleteById(@PathVariable String id) {
        productionOrderOrchestrator.deleteById(id);
        return Result.successMessage("删除成功");
    }

    /**
     * 根据ID删除生产订单
     *
     * @deprecated 已废弃，请使用 DELETE /api/production/order/{id}（RESTful标准）
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @DeleteMapping("/delete/{id}")
    public Result<?> delete(@PathVariable String id) {
        return deleteById(id);
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

        return success ? Result.success("更新成功") : Result.fail("更新失败");
    }

    private Result<?> upsert(ProductionOrder productionOrder) {
        productionOrderOrchestrator.saveOrUpdateOrder(productionOrder);
        if (productionOrder != null && StringUtils.hasText(productionOrder.getId())) {
            ProductionOrder detail = productionOrderOrchestrator.getDetailById(productionOrder.getId());
            return Result.success(detail != null ? detail : productionOrder);
        }
        return Result.success(productionOrder);
    }
}
