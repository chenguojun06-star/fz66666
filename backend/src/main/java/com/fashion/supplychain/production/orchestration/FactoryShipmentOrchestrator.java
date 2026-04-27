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
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
    @Autowired
    private ProductSkuService productSkuService;

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

        // 裁剪总量（上限）
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

        factoryShipmentService.save(fs);
        factoryShipmentDetailService.saveDetails(fs.getId(), details, UserContext.tenantId());

        deductSkuStockOnShip(fs.getStyleNo(), details);

        log.info("[FactoryShipment] 发货 shipmentNo={} orderId={} qty={} skuLines={}",
                fs.getShipmentNo(), orderId, shipQuantity, details.size());
        return Result.success(fs);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<FactoryShipment> receive(String shipmentId, Integer receivedQuantity) {
        if (!StringUtils.hasText(shipmentId)) {
            return Result.fail("缺少发货单 ID");
        }
        FactoryShipment fs = factoryShipmentService.getById(shipmentId);
        if (fs == null) {
            return Result.fail("发货单不存在");
        }
        com.fashion.supplychain.common.tenant.TenantAssert.assertBelongsToCurrentTenant(fs.getTenantId(), "发货单");
        if ("received".equals(fs.getReceiveStatus())) {
            return Result.fail("该发货单已收货，请勿重复操作");
        }
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId) && !ctxFactoryId.equals(fs.getFactoryId())) {
            return Result.fail("无权操作其他工厂的发货单");
        }

        int actualQty = (receivedQuantity != null && receivedQuantity > 0)
                ? receivedQuantity : fs.getShipQuantity();
        if (actualQty > fs.getShipQuantity()) {
            return Result.fail("实际到货数量不能超过发货数量(" + fs.getShipQuantity() + ")");
        }

        fs.setReceiveStatus("received");
        fs.setReceivedQuantity(actualQty);
        fs.setReceiveTime(LocalDateTime.now());
        fs.setReceivedBy(UserContext.userId());
        fs.setReceivedByName(UserContext.username());
        factoryShipmentService.updateById(fs);

        log.info("[FactoryShipment] 收货确认 shipmentId={} orderId={} shipQty={} receivedQty={}",
                shipmentId, fs.getOrderId(), fs.getShipQuantity(), actualQty);
        return Result.success(fs);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<Void> deleteShipment(String shipmentId) {
        if (!StringUtils.hasText(shipmentId)) {
            return Result.fail("缺少发货单 ID");
        }
        FactoryShipment fs = factoryShipmentService.getById(shipmentId);
        if (fs == null) {
            return Result.fail("发货单不存在");
        }
        com.fashion.supplychain.common.tenant.TenantAssert.assertBelongsToCurrentTenant(fs.getTenantId(), "发货单");
        if ("received".equals(fs.getReceiveStatus())) {
            return Result.fail("已收货的发货单不可删除");
        }
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId) && !ctxFactoryId.equals(fs.getFactoryId())) {
            return Result.fail("无权操作其他工厂的发货单");
        }
        FactoryShipment patch = new FactoryShipment();
        patch.setId(shipmentId);
        patch.setDeleteFlag(1);
        patch.setUpdateTime(java.time.LocalDateTime.now());
        factoryShipmentService.updateById(patch);

        restoreSkuStockOnDelete(fs);

        log.info("[FactoryShipment] 软删除发货单 shipmentId={}", shipmentId);
        return Result.success(null);
    }

    /**
     * 获取某订单所有发货单中明细的颜色×尺码汇总，用于进度表 发货数量 列展示。
     * 返回格式：[{color, sizes:[{sizeName, quantity}], total}]
     */
    public List<Map<String, Object>> getOrderShipmentDetailSum(String orderId) {
        List<FactoryShipment> shipments = factoryShipmentService.lambdaQuery()
                .eq(FactoryShipment::getOrderId, orderId)
                .eq(FactoryShipment::getDeleteFlag, 0)
                .list();
        java.util.Set<String> shipmentIds = shipments.stream()
                .map(FactoryShipment::getId)
                .collect(java.util.stream.Collectors.toSet());
        java.util.Map<String, List<FactoryShipmentDetail>> detailMap = shipmentIds.isEmpty()
                ? java.util.Collections.emptyMap()
                : factoryShipmentDetailService.lambdaQuery()
                        .in(FactoryShipmentDetail::getShipmentId, shipmentIds)
                        .list().stream()
                        .collect(java.util.stream.Collectors.groupingBy(FactoryShipmentDetail::getShipmentId));
        Map<String, Map<String, Integer>> colorSizeMap = new LinkedHashMap<>();
        for (FactoryShipment fs : shipments) {
            List<FactoryShipmentDetail> details = detailMap.getOrDefault(fs.getId(), java.util.Collections.emptyList());
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

    public Map<String, Object> getShippableInfo(String orderId) {
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getId, orderId)
                .eq(ProductionOrder::getTenantId, com.fashion.supplychain.common.UserContext.tenantId())
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

    private void deductSkuStockOnShip(String styleNo, List<Map<String, Object>> details) {
        if (!StringUtils.hasText(styleNo) || details == null || details.isEmpty()) {
            return;
        }
        for (Map<String, Object> d : details) {
            String color = (String) d.getOrDefault("color", "");
            String sizeName = (String) d.getOrDefault("sizeName", "");
            int qty = d.get("quantity") instanceof Number ? ((Number) d.get("quantity")).intValue() : 0;
            if (qty <= 0 || !StringUtils.hasText(color) || !StringUtils.hasText(sizeName)) {
                continue;
            }
            String skuCode = String.format("%s-%s-%s", styleNo.trim(), color.trim(), sizeName.trim());
            try {
                productSkuService.updateStock(skuCode, -qty);
            } catch (Exception e) {
                log.warn("[FactoryShipment] SKU库存扣减失败: skuCode={}, qty={}, error={}", skuCode, qty, e.getMessage());
            }
        }
    }

    private void restoreSkuStockOnDelete(FactoryShipment fs) {
        if (fs == null || !StringUtils.hasText(fs.getStyleNo())) {
            return;
        }
        List<FactoryShipmentDetail> details = factoryShipmentDetailService.listByShipmentId(fs.getId());
        if (details == null || details.isEmpty()) {
            return;
        }
        for (FactoryShipmentDetail d : details) {
            String color = d.getColor();
            String sizeName = d.getSizeName();
            int qty = d.getQuantity() != null ? d.getQuantity() : 0;
            if (qty <= 0 || !StringUtils.hasText(color) || !StringUtils.hasText(sizeName)) {
                continue;
            }
            String skuCode = String.format("%s-%s-%s", fs.getStyleNo().trim(), color.trim(), sizeName.trim());
            try {
                productSkuService.updateStock(skuCode, qty);
            } catch (Exception e) {
                log.warn("[FactoryShipment] SKU库存恢复失败: skuCode={}, qty={}, error={}", skuCode, qty, e.getMessage());
            }
        }
    }
}
