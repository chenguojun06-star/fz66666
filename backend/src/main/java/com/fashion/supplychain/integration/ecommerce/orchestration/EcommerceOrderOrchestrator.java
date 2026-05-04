package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.orchestration.EcSalesRevenueOrchestrator;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.integration.ecommerce.service.PlatformNotifyService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

@Slf4j
@Service
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class EcommerceOrderOrchestrator {

    @Autowired
    private EcommerceOrderService ecOrderService;

    @Autowired
    private EcSalesRevenueOrchestrator ecSalesRevenueOrchestrator;

    @Autowired
    private PlatformNotifyService platformNotifyService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> receiveOrder(String platformCode, Map<String, Object> body) {
        Long tenantId = UserContext.tenantId();
        return receiveOrder(platformCode, body, tenantId);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> receiveOrder(String platformCode, Map<String, Object> body, Long tenantId) {
        String platformOrderNo = (String) body.getOrDefault("platformOrderNo", body.get("tid"));
        if (!StringUtils.hasText(platformOrderNo)) {
            throw new IllegalArgumentException("平台订单号不能为空 (platformOrderNo)");
        }
        if (tenantId == null) {
            throw new IllegalArgumentException("租户ID不能为空，Webhook需通过签名识别租户");
        }

        LambdaQueryWrapper<EcommerceOrder> exist = new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getPlatformOrderNo, platformOrderNo)
                .eq(EcommerceOrder::getSourcePlatformCode, platformCode)
                .eq(EcommerceOrder::getTenantId, tenantId);
        EcommerceOrder found = ecOrderService.getOne(exist, false);
        if (found != null) {
            return Map.of("id", found.getId(), "orderNo", found.getOrderNo(), "duplicate", true);
        }

        EcommerceOrder order = new EcommerceOrder();
        order.setSourcePlatformCode(platformCode);
        order.setPlatformOrderNo(platformOrderNo);
        order.setPlatform(toPlatformAbbr(platformCode));
        order.setShopName((String) body.get("shopName"));
        order.setBuyerNick((String) body.get("buyerNick"));
        order.setProductName((String) body.get("productName"));
        order.setSkuCode((String) body.get("skuCode"));
        order.setReceiverName((String) body.get("receiverName"));
        order.setReceiverPhone((String) body.get("receiverPhone"));
        order.setReceiverAddress((String) body.get("receiverAddress"));
        order.setBuyerRemark((String) body.get("buyerRemark"));
        order.setQuantity(parseIntSafe(body.get("quantity"), 1));
        order.setStatus(1);
        order.setWarehouseStatus(0);
        order.setTenantId(tenantId);
        order.setOrderNo(genOrderNo(platformCode));

        if (body.get("unitPrice") != null) {
            order.setUnitPrice(new java.math.BigDecimal(body.get("unitPrice").toString()));
        }
        if (body.get("totalAmount") != null) {
            order.setTotalAmount(new java.math.BigDecimal(body.get("totalAmount").toString()));
        }
        if (body.get("payAmount") != null) {
            order.setPayAmount(new java.math.BigDecimal(body.get("payAmount").toString()));
        }
        if (body.get("freight") != null) {
            order.setFreight(new java.math.BigDecimal(body.get("freight").toString()));
        }
        if (body.get("discount") != null) {
            order.setDiscount(new java.math.BigDecimal(body.get("discount").toString()));
        }
        order.setPayType((String) body.get("payType"));
        ecOrderService.save(order);
        log.info("[EC接入] 平台={} 平台单号={} 内部单号={} tenantId={}", platformCode, platformOrderNo, order.getOrderNo(), tenantId);

        try {
            // 优先用 body 里的 styleNo（聚水潭 i_id 直接=款号），
            // 没有则从 skuCode 提取第一段（shop_sku_id 格式 = 款号-颜色-尺码）
            String styleNo = (String) body.getOrDefault("styleNo", "");
            if (!StringUtils.hasText(styleNo) && StringUtils.hasText(order.getSkuCode())) {
                styleNo = order.getSkuCode().split("-")[0];
            }
            if (StringUtils.hasText(styleNo)) {
                ProductionOrder matched = productionOrderService.getOne(
                        new LambdaQueryWrapper<ProductionOrder>()
                                .eq(ProductionOrder::getStyleNo, styleNo)
                                .eq(ProductionOrder::getTenantId, tenantId)
                                .ne(ProductionOrder::getStatus, "completed")
                                .eq(ProductionOrder::getDeleteFlag, 0)
                                .orderByAsc(ProductionOrder::getCreateTime)
                                .last("LIMIT 1"), false);
                if (matched != null) {
                    order.setProductionOrderNo(matched.getOrderNo());
                    order.setWarehouseStatus(1);
                    ecOrderService.updateById(order);
                    log.info("[EC自动匹配] EC单={} 关联生产单={} styleNo={}",
                            order.getOrderNo(), matched.getOrderNo(), styleNo);
                }
            }
        } catch (Exception e) {
            log.warn("[EC自动匹配] SKU匹配异常，不阻断接单: {}", e.getMessage());
        }

        return Map.of("id", order.getId(), "orderNo", order.getOrderNo(), "duplicate", false);
    }

    public IPage<EcommerceOrder> listOrders(Map<String, Object> params) {
        int page = parseIntSafe(params.get("page"), 1);
        int pageSize = parseIntSafe(params.get("pageSize"), 20);
        LambdaQueryWrapper<EcommerceOrder> wrapper = new LambdaQueryWrapper<EcommerceOrder>()
                .orderByDesc(EcommerceOrder::getCreateTime);

        Long tenantId = TenantAssert.requireTenantId();
        wrapper.eq(EcommerceOrder::getTenantId, tenantId);

        String platform = (String) params.get("platform");
        if (StringUtils.hasText(platform)) wrapper.eq(EcommerceOrder::getSourcePlatformCode, platform);

        Object status = params.get("status");
        if (status != null) wrapper.eq(EcommerceOrder::getStatus, parseIntSafe(status, -1));

        String keyword = (String) params.get("keyword");
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(EcommerceOrder::getPlatformOrderNo, keyword)
                    .or().like(EcommerceOrder::getOrderNo, keyword)
                    .or().like(EcommerceOrder::getBuyerNick, keyword)
                    .or().like(EcommerceOrder::getReceiverName, keyword));
        }
        return ecOrderService.page(new Page<>(page, pageSize), wrapper);
    }

    @Transactional(rollbackFor = Exception.class)
    public void linkProductionOrder(Long ecOrderId, String productionOrderNo) {
        Long tenantId = TenantAssert.requireTenantId();
        EcommerceOrder order = ecOrderService.getOne(
                new LambdaQueryWrapper<EcommerceOrder>()
                        .eq(EcommerceOrder::getId, ecOrderId)
                        .eq(EcommerceOrder::getTenantId, tenantId));
        if (order == null) throw new IllegalArgumentException("电商订单不存在或无权操作: " + ecOrderId);
        order.setProductionOrderNo(productionOrderNo);
        order.setWarehouseStatus(1);
        ecOrderService.updateById(order);
        log.info("[EC关联] EC订单={} 关联生产订单={}", order.getOrderNo(), productionOrderNo);
    }

    @Transactional(rollbackFor = Exception.class)
    public void directOutbound(Long ecOrderId, String trackingNo, String expressCompany) {
        Long tenantId = TenantAssert.requireTenantId();
        EcommerceOrder order = ecOrderService.getOne(
                new LambdaQueryWrapper<EcommerceOrder>()
                        .eq(EcommerceOrder::getId, ecOrderId)
                        .eq(EcommerceOrder::getTenantId, tenantId));
        if (order == null) throw new IllegalArgumentException("电商订单不存在或无权操作: " + ecOrderId);
        if (order.getWarehouseStatus() != null && order.getWarehouseStatus() >= 2) {
            throw new IllegalStateException("订单已出库，无需重复操作");
        }
        order.setStatus(2);
        order.setWarehouseStatus(2);
        order.setTrackingNo(trackingNo);
        order.setExpressCompany(expressCompany);
        order.setShipTime(LocalDateTime.now());
        ecOrderService.updateById(order);
        log.info("[EC现货出库] EC单号={} 快递公司={} 快递单号={}", order.getOrderNo(), expressCompany, trackingNo);
        try {
            ecSalesRevenueOrchestrator.recordOnOutbound(order);
        } catch (Exception e) {
            log.warn("[EC现货出库] 收入流水记录失败，不阻断出库: {}", e.getMessage());
        }
        try {
            platformNotifyService.notifyShipped(order);
        } catch (Exception e) {
            log.warn("[EC现货出库] 物流回传失败: {}", e.getMessage());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void onWarehouseOutbound(String productionOrderNo, String trackingNo, String expressCompany) {
        if (!StringUtils.hasText(productionOrderNo)) return;
        Long tenantId = TenantAssert.requireTenantId();
        LambdaQueryWrapper<EcommerceOrder> wrapper = new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getProductionOrderNo, productionOrderNo)
                .eq(EcommerceOrder::getTenantId, tenantId)
                .in(EcommerceOrder::getStatus, 1, 2);
        EcommerceOrder order = ecOrderService.getOne(wrapper, false);
        if (order == null) return;
        order.setStatus(2);
        order.setWarehouseStatus(2);
        order.setTrackingNo(trackingNo);
        order.setExpressCompany(expressCompany);
        order.setShipTime(LocalDateTime.now());
        ecOrderService.updateById(order);
        log.info("[EC出库回写] 生产单={} 快递单号={} EC订单={}", productionOrderNo, trackingNo, order.getOrderNo());
        try {
            ecSalesRevenueOrchestrator.recordOnOutbound(order);
        } catch (Exception e) {
            log.warn("[EC出库回写] 收入流水记录失败，不阻断出库: {}", e.getMessage());
        }
        try {
            platformNotifyService.notifyShipped(order);
        } catch (Exception e) {
            log.warn("[EC出库回写] 物流回传失败: {}", e.getMessage());
        }
    }

    private String genOrderNo(String platformCode) {
        String prefix = switch (platformCode) {
            case "TAOBAO" -> "TB";
            case "TMALL" -> "TM";
            case "JD" -> "JD";
            case "DOUYIN" -> "DY";
            case "PINDUODUO" -> "PDD";
            case "XIAOHONGSHU" -> "XHS";
            case "WECHAT_SHOP" -> "WC";
            case "SHOPIFY" -> "SFY";
            case "SHEIN" -> "SY";
            case "JST" -> "JST";
            case "DONGFANG" -> "DF";
            default -> "EC";
        };
        return prefix + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyMMddHHmmssSSS"));
    }

    private String toPlatformAbbr(String code) {
        return switch (code) {
            case "TAOBAO" -> "TB";
            case "TMALL" -> "TM";
            case "JD" -> "JD";
            case "DOUYIN" -> "DY";
            case "PINDUODUO" -> "PDD";
            case "XIAOHONGSHU" -> "XHS";
            case "WECHAT_SHOP" -> "WC";
            case "SHOPIFY" -> "SFY";
            case "SHEIN" -> "SY";
            case "JST" -> "JST";
            case "DONGFANG" -> "DF";
            default -> code;
        };
    }

    private int parseIntSafe(Object val, int defaultVal) {
        if (val == null) return defaultVal;
        try { return Integer.parseInt(val.toString()); } catch (Exception e) { return defaultVal; }
    }
}
