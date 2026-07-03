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
import com.fashion.supplychain.style.service.ProductSkuService;
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

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private EcOrderProcessOrchestrator orderProcessOrchestrator;

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
                    // 回写 platformCode 到生产订单（仅在未设置时）
                    if (StringUtils.hasText(order.getPlatform()) && !StringUtils.hasText(matched.getPlatformCode())) {
                        try {
                            productionOrderService.lambdaUpdate()
                                    .eq(ProductionOrder::getId, matched.getId())
                                    .eq(ProductionOrder::getTenantId, tenantId)
                                    .set(ProductionOrder::getPlatformCode, order.getPlatform())
                                    .update();
                        } catch (Exception ex) {
                            log.warn("[EC自动匹配] 回写 platformCode 失败: prodOrderId={}", matched.getId());
                        }
                    }
                    log.info("[EC自动匹配] EC单={} 关联生产单={} styleNo={}",
                            order.getOrderNo(), matched.getOrderNo(), styleNo);
                }
            }
        } catch (Exception e) {
            log.warn("[EC自动匹配] SKU匹配异常，不阻断接单: {}", e.getMessage());
        }

        // 智能仓库分配
        try {
            EcOrderProcessOrchestrator.OrderProcessResult result = orderProcessOrchestrator.processOrder(
                    tenantId, order.getId(), order.getOrderNo(),
                    null, null, order.getSkuCode(), order.getQuantity() != null ? order.getQuantity() : 0);
            log.info("[EcommerceOrderOrchestrator] 订单处理结果: orderNo={}, fullyAllocated={}, unfulfilled={}",
                    order.getOrderNo(), result.fullyAllocated(), result.unfulfilledQty());
        } catch (Exception e) {
            log.warn("[EcommerceOrderOrchestrator] 仓库分配失败，订单仍保留: orderNo={}", order.getOrderNo(), e);
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
        if (StringUtils.hasText(platform)) {
            // 兼容短码（TB/TM/JD等）和全码（TAOBAO/TMALL等）
            String fullCode = expandPlatformCode(platform);
            if (fullCode != null) {
                wrapper.and(w -> w.eq(EcommerceOrder::getSourcePlatformCode, fullCode)
                        .or().eq(EcommerceOrder::getSourcePlatformCode, platform)
                        .or().eq(EcommerceOrder::getPlatform, platform));
            } else {
                wrapper.and(w -> w.eq(EcommerceOrder::getSourcePlatformCode, platform)
                        .or().eq(EcommerceOrder::getPlatform, platform));
            }
        }

        Object status = params.get("status");
        if (status != null) wrapper.eq(EcommerceOrder::getStatus, parseIntSafe(status, -1));

        String keyword = (String) params.get("keyword");
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(EcommerceOrder::getPlatformOrderNo, keyword)
                    .or().like(EcommerceOrder::getOrderNo, keyword)
                    .or().like(EcommerceOrder::getBuyerNick, keyword)
                    .or().like(EcommerceOrder::getReceiverName, keyword));
        }
        Object linkedParam = params.get("productionOrderLinked");
        if (linkedParam instanceof Boolean) {
            if ((Boolean) linkedParam) {
                wrapper.isNotNull(EcommerceOrder::getProductionOrderNo);
            } else {
                wrapper.isNull(EcommerceOrder::getProductionOrderNo);
            }
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
        // 回写 platformCode 到生产订单（仅在未设置时，避免覆盖人工设置）
        if (StringUtils.hasText(order.getPlatform())) {
            try {
                ProductionOrder prodOrder = productionOrderService.getOne(
                        new LambdaQueryWrapper<ProductionOrder>()
                                .eq(ProductionOrder::getOrderNo, productionOrderNo)
                                .eq(ProductionOrder::getTenantId, tenantId));
                if (prodOrder != null && !StringUtils.hasText(prodOrder.getPlatformCode())) {
                    productionOrderService.lambdaUpdate()
                            .eq(ProductionOrder::getId, prodOrder.getId())
                            .eq(ProductionOrder::getTenantId, tenantId)
                            .set(ProductionOrder::getPlatformCode, order.getPlatform())
                            .update();
                    log.info("[EC关联] 回写 platformCode 到生产订单: prodOrderNo={} platform={}",
                            productionOrderNo, order.getPlatform());
                }
            } catch (Exception e) {
                log.warn("[EC关联] 回写 platformCode 失败，不阻断关联: prodOrderNo={} {}", productionOrderNo, e.getMessage());
            }
        }
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
        String skuCode = order.getSkuCode();
        int quantity = order.getQuantity() != null ? order.getQuantity() : 1;
        if (StringUtils.hasText(skuCode)) {
            boolean deducted = productSkuService.decreaseStockBySkuCode(skuCode, quantity);
            if (!deducted) {
                throw new IllegalStateException(
                        "库存不足: SKU=" + skuCode + "，请先入库再出库，或检查库存数量");
            }
            log.info("[EC现货出库] SKU库存已扣减: skuCode={} quantity={}", skuCode, quantity);
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
            default -> code;
        };
    }

    /** 短码 → 全码（用于 platform 筛选兼容） */
    private String expandPlatformCode(String shortCode) {
        if (shortCode == null) return null;
        return switch (shortCode.toUpperCase()) {
            case "TB" -> "TAOBAO";
            case "TM" -> "TMALL";
            case "JD" -> "JD";
            case "DY" -> "DOUYIN";
            case "PDD" -> "PINDUODUO";
            case "XHS" -> "XIAOHONGSHU";
            case "WC" -> "WECHAT_SHOP";
            case "SFY" -> "SHOPIFY";
            case "SY" -> "SHEIN";
            case "JST" -> "JST";
            default -> null;
        };
    }

    private int parseIntSafe(Object val, int defaultVal) {
        if (val == null) return defaultVal;
        try { return Integer.parseInt(val.toString()); } catch (Exception e) { return defaultVal; }
    }
}
