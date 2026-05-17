package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.integration.entity.ExpressOrder;
import com.fashion.supplychain.integration.logistics.LogisticsManager;
import com.fashion.supplychain.integration.logistics.LogisticsService;
import com.fashion.supplychain.integration.logistics.ShippingRequest;
import com.fashion.supplychain.integration.logistics.ShippingResponse;
import com.fashion.supplychain.integration.service.ExpressOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class ExpressOrderOrchestrator {

    @Autowired
    private LogisticsManager logisticsManager;

    @Autowired
    private ExpressOrderService expressOrderService;

    @Autowired
    private EcommerceOrderService ecommerceOrderService;

    @Transactional
    public Map<String, Object> createShipment(String ecommerceOrderId, Integer expressCompanyCode, BigDecimal weight) {
        Long tenantId = TenantAssert.requireTenantId();

        EcommerceOrder ecOrder = ecommerceOrderService.getById(ecommerceOrderId);
        if (ecOrder == null) {
            throw new IllegalArgumentException("电商订单不存在: " + ecommerceOrderId);
        }

        LogisticsService.LogisticsType logisticsType = resolveLogisticsType(expressCompanyCode);

        ShippingRequest.ContactInfo receiver = ShippingRequest.ContactInfo.builder()
                .name(ecOrder.getReceiverName() != null ? ecOrder.getReceiverName() : "收件人")
                .mobile(ecOrder.getReceiverPhone() != null ? ecOrder.getReceiverPhone() : "")
                .province("")
                .city("")
                .district("")
                .address(ecOrder.getReceiverAddress() != null ? ecOrder.getReceiverAddress() : "")
                .build();

        ShippingRequest.ContactInfo sender = ShippingRequest.ContactInfo.builder()
                .name("东方制衣厂")
                .mobile("13800000000")
                .province("广东省")
                .city("广州市")
                .district("白云区")
                .address("石井街道东方制衣厂")
                .build();

        BigDecimal cargoWeight = weight != null && weight.compareTo(BigDecimal.ZERO) > 0
                ? weight : BigDecimal.valueOf(1.0);

        ShippingRequest.CargoInfo cargo = ShippingRequest.CargoInfo.builder()
                .name(ecOrder.getProductName() != null ? ecOrder.getProductName() : "服装")
                .quantity(ecOrder.getQuantity() != null ? ecOrder.getQuantity() : 1)
                .weight(cargoWeight)
                .type("服装")
                .build();

        ShippingRequest request = ShippingRequest.builder()
                .orderId(ecommerceOrderId)
                .logisticsType(logisticsType)
                .sender(sender)
                .recipient(receiver)
                .cargo(cargo)
                .serviceType("标准快递")
                .paymentMethod(ShippingRequest.PaymentMethod.SENDER_PAY)
                .build();

        ShippingResponse resp = logisticsManager.createShipment(request);

        ExpressOrder expressOrder = new ExpressOrder();
        expressOrder.setTrackingNo(resp.getTrackingNumber());
        expressOrder.setExpressCompany(expressCompanyCode);
        expressOrder.setLogisticsStatus(0);
        expressOrder.setOrderId(ecommerceOrderId);
        expressOrder.setOrderNo(ecOrder.getOrderNo());
        expressOrder.setReceiverName(receiver.getName());
        expressOrder.setReceiverPhone(receiver.getMobile());
        expressOrder.setReceiverAddress(receiver.getAddress());
        expressOrder.setShipmentQuantity(cargo.getQuantity());
        expressOrder.setWeight(cargoWeight);
        expressOrder.setFreightAmount(resp.getShippingFee() != null ? BigDecimal.valueOf(resp.getShippingFee()) : null);
        expressOrder.setPlatformOrderNo(ecOrder.getPlatformOrderNo());
        expressOrder.setPlatformCode(ecOrder.getSourcePlatformCode());
        expressOrder.setTenantId(tenantId);
        expressOrderService.createExpressOrder(expressOrder);

        log.info("[快递下单] 成功 tenant={} orderId={} trackingNo={} company={}",
                tenantId, ecommerceOrderId, resp.getTrackingNumber(), logisticsType.getDisplayName());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("expressOrderId", expressOrder.getId());
        result.put("trackingNo", resp.getTrackingNumber());
        result.put("companyName", logisticsType.getDisplayName());
        result.put("companyCode", logisticsType.getCode());
        result.put("receiverName", receiver.getName());
        result.put("receiverPhone", receiver.getMobile());
        result.put("receiverAddress", receiver.getAddress());
        return result;
    }

    @Transactional
    public Map<String, Object> cancelShipment(String expressOrderId) {
        ExpressOrder order = expressOrderService.getById(expressOrderId);
        if (order == null) {
            throw new IllegalArgumentException("快递单不存在: " + expressOrderId);
        }
        if (order.getTrackingNo() == null) {
            throw new IllegalArgumentException("该快递单没有运单号，无法取消");
        }

        LogisticsService.LogisticsType logisticsType = resolveLogisticsType(order.getExpressCompany());
        boolean cancelled = logisticsManager.cancelShipment(order.getTrackingNo(), "用户取消", logisticsType);

        if (cancelled) {
            order.setLogisticsStatus(5);
            expressOrderService.updateById(order);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("cancelled", cancelled);
        result.put("trackingNo", order.getTrackingNo());
        return result;
    }

    private LogisticsService.LogisticsType resolveLogisticsType(Integer companyCode) {
        if (companyCode == null) return LogisticsService.LogisticsType.SF;
        return switch (companyCode) {
            case 1 -> LogisticsService.LogisticsType.SF;
            case 2 -> LogisticsService.LogisticsType.STO;
            case 3 -> LogisticsService.LogisticsType.YTO;
            case 4 -> LogisticsService.LogisticsType.ZTO;
            case 5 -> LogisticsService.LogisticsType.EMS;
            case 6 -> LogisticsService.LogisticsType.JD;
            case 7 -> LogisticsService.LogisticsType.YD;
            default -> LogisticsService.LogisticsType.SF;
        };
    }
}