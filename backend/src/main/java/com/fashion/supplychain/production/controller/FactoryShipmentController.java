package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.FactoryShipment;
import com.fashion.supplychain.production.entity.FactoryShipmentDetail;
import com.fashion.supplychain.production.orchestration.FactoryShipmentOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 外发工厂收发货 Controller。
 * <p>
 * 职责边界：
 * <ul>
 *   <li>发货 — 外发工厂操作，创建发货单</li>
 *   <li>收货 — 本厂确认到货数量（仅物流确认，不做质检）</li>
 *   <li>质检/次品/返修/入库 — 由质检入库页面(/production/warehousing)负责</li>
 * </ul>
 * </p>
 * <p>
 * D-636：原先本类直接注入了 FactoryShipmentService / FactoryShipmentDetailService /
 * ProductionOrderService 三个 Service（数据权限过滤、订单查询、明细查询都在 Controller 里做），
 * 属「Controller 依赖多个 Service」。现已全部下沉到 {@link FactoryShipmentOrchestrator}，
 * 本类只保留「端点声明 + 请求参数解析 + 响应组装」。
 * </p>
 */
@RestController
@RequestMapping("/api/production/factory-shipment")
@PreAuthorize("isAuthenticated()")
public class FactoryShipmentController {

    @Autowired
    private FactoryShipmentOrchestrator factoryShipmentOrchestrator;

    /** 外发工厂发货 */
    @PostMapping("/ship")
    public Result<FactoryShipment> ship(@RequestBody Map<String, Object> params) {
        return factoryShipmentOrchestrator.ship(params);
    }

    /** 本厂收货确认 — 仅确认到货数量，不做质检 */
    @PostMapping("/{id}/receive")
    public Result<FactoryShipment> receive(@PathVariable("id") String id,
                                           @RequestBody Map<String, Object> params) {
        Integer receivedQuantity = params.get("receivedQuantity") instanceof Number
                ? ((Number) params.get("receivedQuantity")).intValue() : null;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> receivedDetails = params.get("details") instanceof List
                ? (List<Map<String, Object>>) params.get("details") : null;
        return factoryShipmentOrchestrator.receive(id, receivedQuantity, receivedDetails);
    }

    /**
     * D-309 发货/收货通知（小云待办数据源）：
     * - 租户侧：receiveStatus=pending（工厂已发货待本厂收货确认）；管理员/租户主看全部，跟单员只看自己跟单的订单；
     * - 工厂账号：近 7 天被确认收货的发货单（回执通知"已收货"）。
     */
    @GetMapping("/notifications")
    public Result<?> notifications() {
        return Result.success(factoryShipmentOrchestrator.shipmentNotifications());
    }

    /**
     * D-310 订单级发货限制切换（仅租户管理方）：
     * locked=1 禁止该外发订单发货（订单异常锁定），locked=0 恢复。工厂账号不可调用。
     */
    @PutMapping("/{orderId}/ship-lock")
    public Result<Boolean> setShipLock(@PathVariable("orderId") String orderId,
                                       @RequestBody Map<String, Object> body) {
        boolean locked = body.get("locked") instanceof Boolean ? (Boolean) body.get("locked")
                : "1".equals(String.valueOf(body.get("locked")));
        return Result.success(factoryShipmentOrchestrator.setShipLock(orderId, locked));
    }

    /** 发货单列表 */
    @PostMapping("/list")
    public Result<IPage<FactoryShipment>> list(@RequestBody Map<String, Object> params) {
        return factoryShipmentOrchestrator.queryPage(params);
    }

    /** 按订单查发货单（无分页） */
    @PostMapping("/search")
    public Result<List<FactoryShipment>> listByOrderPost(@RequestBody Map<String, String> params) {
        String orderId = params != null ? params.get("orderId") : null;
        if (orderId == null || orderId.isBlank()) {
            return Result.fail("orderId不能为空");
        }
        return factoryShipmentOrchestrator.listByOrder(orderId);
    }

    /** @deprecated 使用 POST /search 替代 */
    @Deprecated // 计划于 2026-08-10 移除，请使用新端点替代
    @GetMapping("/by-order/{orderId}")
    public Result<List<FactoryShipment>> listByOrder(@PathVariable("orderId") String orderId) {
        return factoryShipmentOrchestrator.listByOrder(orderId);
    }

    /** 可发货信息 */
    @GetMapping("/shippable/{orderId}")
    public Result<Map<String, Object>> shippable(@PathVariable("orderId") String orderId) {
        return Result.success(factoryShipmentOrchestrator.getShippableInfo(orderId));
    }

    /** 删除发货单 */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable("id") String id) {
        return factoryShipmentOrchestrator.deleteShipment(id);
    }

    /** 发货单明细 */
    @GetMapping("/{id}/details")
    public Result<List<FactoryShipmentDetail>> getDetails(@PathVariable("id") String id) {
        return Result.success(factoryShipmentOrchestrator.listDetails(id));
    }

    /** 订单发货汇总（颜色×尺码） */
    @GetMapping("/order-detail-sum/{orderId}")
    public Result<List<Map<String, Object>>> getOrderDetailSum(@PathVariable("orderId") String orderId) {
        return Result.success(factoryShipmentOrchestrator.getOrderShipmentDetailSum(orderId));
    }
}
