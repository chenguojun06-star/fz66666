package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.FactoryShipment;
import com.fashion.supplychain.production.entity.FactoryShipmentDetail;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.FactoryShipmentService;
import com.fashion.supplychain.production.service.FactoryShipmentDetailService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 外发工厂发货/收货 Orchestrator。
 *
 * <p>闭环流程（职责边界）：
 * <ol>
 *   <li>外发工厂发货 (ship) → 创建发货单，状态 pending</li>
 *   <li>本厂收货确认 (receive) → 确认物流到货数量，状态 received</li>
 *   <li>质检入库 → 由 /production/warehousing 页面负责（不在本模块）</li>
 *   <li>次品返修 → 由质检入库流程处理（不在本模块）</li>
 * </ol>
 * </p>
 *
 * <p>关键规则：
 * <ul>
 *   <li>发货/收货不做库存变更 — 库存变更由成品入库(ProductWarehousing)负责</li>
 *   <li>收货由租户（本厂）操作，非外发工厂账号</li>
 *   <li>发货量不能超过裁剪总量</li>
 * </ul>
 * </p>
 */
@Service
@Slf4j
public class FactoryShipmentOrchestrator {

    @Autowired
    private FactoryShipmentService factoryShipmentService;
    @Autowired
    private CuttingBundleService cuttingBundleService;
    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private FactoryShipmentDetailService factoryShipmentDetailService;

    // ===== 发货 =====

    /**
     * 外发工厂发货 — 创建发货单（仅物流记录，不影响库存）。
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<FactoryShipment> ship(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        String orderId = (String) params.get("orderId");
        if (!StringUtils.hasText(orderId)) {
            return Result.fail("缺少 orderId");
        }
        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            return Result.fail("订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "生产订单");
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId) && !ctxFactoryId.equals(order.getFactoryId())) {
            return Result.fail("无权操作其他工厂的订单");
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> details = (List<Map<String, Object>>) params.get("details");
        if (details == null || details.isEmpty()) {
            return Result.fail("请填写发货明细（颜色/尺码/数量）");
        }
        int shipQuantity = details.stream()
                .mapToInt(d -> d.get("quantity") instanceof Number ? ((Number) d.get("quantity")).intValue() : 0)
                .sum();
        if (shipQuantity <= 0) {
            return Result.fail("发货数量明细总量必须大于 0");
        }

        // 裁剪总量上限校验
        Map<String, Object> summary = cuttingBundleService.summarize(order.getOrderNo(), orderId);
        int cuttingTotal = summary != null ? (int) summary.getOrDefault("totalQuantity", 0) : 0;
        int alreadyShipped = factoryShipmentService.sumShippedByOrderId(orderId);
        if (alreadyShipped + shipQuantity > cuttingTotal) {
            return Result.fail("发货数量超限，裁剪总量 " + cuttingTotal
                    + "，已发 " + alreadyShipped + "，本次 " + shipQuantity);
        }

        FactoryShipment fs = new FactoryShipment();
        fs.setShipmentNo(factoryShipmentService.buildShipmentNo());
        fs.setOrderId(orderId);
        fs.setOrderNo(order.getOrderNo());
        fs.setStyleNo(order.getStyleNo());
        fs.setStyleName(order.getStyleName());
        fs.setFactoryId(order.getFactoryId());
        fs.setFactoryName(order.getFactoryName());
        fs.setShipQuantity(shipQuantity);
        fs.setShipTime(LocalDateTime.now());
        fs.setShippedBy(UserContext.userId());
        fs.setShippedByName(UserContext.username());
        fs.setTrackingNo((String) params.get("trackingNo"));
        fs.setExpressCompany((String) params.get("expressCompany"));
        fs.setShipMethod((String) params.get("shipMethod"));
        fs.setRemark((String) params.get("remark"));
        fs.setReceiveStatus("pending");
        fs.setReceivedQuantity(0);

        factoryShipmentService.save(fs);
        factoryShipmentDetailService.saveDetails(fs.getId(), details, UserContext.tenantId());

        log.info("[FactoryShipment] 发货 shipmentNo={} orderId={} qty={} lines={} factory={}",
                fs.getShipmentNo(), orderId, shipQuantity, details.size(), order.getFactoryName());
        return Result.success(fs);
    }

    // ===== 收货确认（仅物流到货确认，不做质检） =====

    /**
     * 收货确认 — 仅确认到货数量，不做质检。
     * 质检由 /production/warehousing 页面负责。
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<FactoryShipment> receive(String shipmentId, Integer receivedQuantity,
                                            List<Map<String, Object>> receivedDetails) {
        if (!StringUtils.hasText(shipmentId)) {
            return Result.fail("缺少发货单 ID");
        }
        FactoryShipment fs = factoryShipmentService.getById(shipmentId);
        if (fs == null) {
            return Result.fail("发货单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(fs.getTenantId(), "发货单");
        if (!"pending".equals(fs.getReceiveStatus())) {
            return Result.fail("该发货单状态为 " + fs.getReceiveStatus() + "，无法收货");
        }

        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            return Result.fail("外发工厂账号不可操作收货，请使用本厂账号登录");
        }

        int actualQty = (receivedQuantity != null && receivedQuantity > 0)
                ? receivedQuantity : fs.getShipQuantity();

        if (actualQty > fs.getShipQuantity()) {
            return Result.fail("实际到货数量(" + actualQty + ")不能超过发货数量(" + fs.getShipQuantity() + ")");
        }

        fs.setReceiveStatus("received");
        fs.setReceivedQuantity(actualQty);
        fs.setReceiveTime(LocalDateTime.now());
        fs.setReceivedBy(UserContext.userId());
        fs.setReceivedByName(UserContext.username());
        factoryShipmentService.updateById(fs);

        if (receivedDetails != null && !receivedDetails.isEmpty()) {
            factoryShipmentDetailService.updateReceivedDetails(shipmentId, receivedDetails);
        }

        log.info("[FactoryShipment] 收货确认 shipmentId={} orderId={} shipQty={} receivedQty={} detailLines={}",
                shipmentId, fs.getOrderId(), fs.getShipQuantity(), actualQty,
                receivedDetails != null ? receivedDetails.size() : 0);
        return Result.success(fs);
    }

    // ===== 删除发货单 =====

    @Transactional(rollbackFor = Exception.class)
    public Result<Void> deleteShipment(String shipmentId) {
        if (!StringUtils.hasText(shipmentId)) {
            return Result.fail("缺少发货单 ID");
        }
        FactoryShipment fs = factoryShipmentService.getById(shipmentId);
        if (fs == null) {
            return Result.fail("发货单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(fs.getTenantId(), "发货单");
        if ("received".equals(fs.getReceiveStatus())) {
            return Result.fail("已收货的发货单不可删除，如需退货请联系管理员");
        }
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId) && !ctxFactoryId.equals(fs.getFactoryId())) {
            return Result.fail("无权操作其他工厂的发货单");
        }

        FactoryShipment patch = new FactoryShipment();
        patch.setId(shipmentId);
        patch.setDeleteFlag(1);
        patch.setUpdateTime(LocalDateTime.now());
        factoryShipmentService.updateById(patch);

        log.info("[FactoryShipment] 软删除发货单 shipmentId={}", shipmentId);
        return Result.success(null);
    }

    // ===== 查询 =====

    public Map<String, Object> getShippableInfo(String orderId) {
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getId, orderId)
                .eq(ProductionOrder::getTenantId, UserContext.tenantId())
                .eq(ProductionOrder::getDeleteFlag, 0)
                .one();
        int cuttingTotal = 0;
        if (order != null) {
            Map<String, Object> summary = cuttingBundleService.summarize(order.getOrderNo(), orderId);
            cuttingTotal = summary != null ? (int) summary.getOrDefault("totalQuantity", 0) : 0;
        }
        int shipped = factoryShipmentService.sumShippedByOrderId(orderId);

        Map<String, Object> info = new HashMap<>();
        info.put("cuttingTotal", cuttingTotal);
        info.put("shippedTotal", shipped);
        info.put("remaining", Math.max(0, cuttingTotal - shipped));
        return info;
    }

    public List<Map<String, Object>> getOrderShipmentDetailSum(String orderId) {
        List<FactoryShipment> shipments = factoryShipmentService.lambdaQuery()
                .eq(FactoryShipment::getOrderId, orderId)
                .eq(FactoryShipment::getDeleteFlag, 0)
                .list();
        Set<String> shipmentIds = shipments.stream()
                .map(FactoryShipment::getId)
                .collect(Collectors.toSet());
        Map<String, List<FactoryShipmentDetail>> detailMap = shipmentIds.isEmpty()
                ? Collections.emptyMap()
                : factoryShipmentDetailService.lambdaQuery()
                        .in(FactoryShipmentDetail::getShipmentId, shipmentIds)
                        .list().stream()
                        .collect(Collectors.groupingBy(FactoryShipmentDetail::getShipmentId));
        Map<String, Map<String, Integer>> colorSizeMap = new LinkedHashMap<>();
        for (FactoryShipment fs : shipments) {
            List<FactoryShipmentDetail> details = detailMap.getOrDefault(fs.getId(), Collections.emptyList());
            for (FactoryShipmentDetail d : details) {
                String color = d.getColor() != null ? d.getColor() : "";
                String size  = d.getSizeName() != null ? d.getSizeName() : "";
                colorSizeMap.computeIfAbsent(color, k -> new LinkedHashMap<>())
                            .merge(size, d.getQuantity() != null ? d.getQuantity() : 0, Integer::sum);
            }
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, Map<String, Integer>> e : colorSizeMap.entrySet()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("color", e.getKey());
            List<Map<String, Object>> sizes = new ArrayList<>();
            int rowTotal = 0;
            for (Map.Entry<String, Integer> se : e.getValue().entrySet()) {
                Map<String, Object> sizeRow = new LinkedHashMap<>();
                sizeRow.put("sizeName", se.getKey());
                sizeRow.put("quantity", se.getValue());
                sizes.add(sizeRow);
                rowTotal += se.getValue();
            }
            row.put("sizes", sizes);
            row.put("total", rowTotal);
            result.add(row);
        }
        return result;
    }
}
