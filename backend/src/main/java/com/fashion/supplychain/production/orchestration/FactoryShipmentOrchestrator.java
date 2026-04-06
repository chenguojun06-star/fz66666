package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.FactoryShipment;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.FactoryShipmentService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
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

    @Transactional(rollbackFor = Exception.class)
    public Result<FactoryShipment> ship(Map<String, Object> params) {
        String orderId = (String) params.get("orderId");
        if (!StringUtils.hasText(orderId)) {
            return Result.fail("缺少 orderId");
        }
        Object qtyObj = params.get("shipQuantity");
        int shipQuantity = qtyObj instanceof Number ? ((Number) qtyObj).intValue() : 0;
        if (shipQuantity <= 0) {
            return Result.fail("发货数量必须大于 0");
        }

        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            return Result.fail("订单不存在");
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
        log.info("[FactoryShipment] 发货 shipmentNo={} orderId={} qty={}",
                fs.getShipmentNo(), orderId, shipQuantity);
        return Result.success(fs);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<FactoryShipment> receive(String shipmentId) {
        if (!StringUtils.hasText(shipmentId)) {
            return Result.fail("缺少发货单 ID");
        }
        FactoryShipment fs = factoryShipmentService.getById(shipmentId);
        if (fs == null) {
            return Result.fail("发货单不存在");
        }
        if ("received".equals(fs.getReceiveStatus())) {
            return Result.fail("该发货单已收货，请勿重复操作");
        }

        fs.setReceiveStatus("received");
        fs.setReceiveTime(LocalDateTime.now());
        fs.setReceivedBy(UserContext.userId());
        fs.setReceivedByName(UserContext.username());
        factoryShipmentService.updateById(fs);

        log.info("[FactoryShipment] 收货确认 shipmentId={} orderId={} qty={}",
                shipmentId, fs.getOrderId(), fs.getShipQuantity());
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
        if ("received".equals(fs.getReceiveStatus())) {
            return Result.fail("已收货的发货单不可删除");
        }
        factoryShipmentService.removeById(shipmentId);
        log.info("[FactoryShipment] 删除发货单 shipmentId={}", shipmentId);
        return Result.success(null);
    }

    public Map<String, Object> getShippableInfo(String orderId) {
        ProductionOrder order = productionOrderService.getById(orderId);
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
}
