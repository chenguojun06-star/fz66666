package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.orchestration.EcSalesRevenueOrchestrator;
import com.fashion.supplychain.integration.ecommerce.entity.EcGiftRule;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.service.EcGiftRuleService;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.integration.ecommerce.helper.PlatformNotifyHelper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.fashion.supplychain.warehouse.constant.OutstockTypeConstants;

@Slf4j
@Service
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class EcommerceOrderOrchestrator {

    @Autowired
    private EcommerceOrderService ecOrderService;

    @Autowired
    private EcSalesRevenueOrchestrator ecSalesRevenueOrchestrator;

    @Autowired
    private PlatformNotifyHelper platformNotifyHelper;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private EcOrderProcessOrchestrator orderProcessOrchestrator;

    /** D-647：赠品规则（Phase 2 订单深加工），原 EcommerceOrderController 直接注入该 Service */
    @Autowired
    private EcGiftRuleService giftRuleService;

    /** D-532：组合商品（套装）——平台订单的商品编码=combo_code 时识别为套装订单 */
    @Autowired
    private com.fashion.supplychain.warehouse.service.ComboProductService comboProductService;

    /**
     * D-532：套装出库链路（组合订单直发时按子SKU扣库存）。
     * FinishedOutstockHelper 已 @Lazy 注入本类，这里同样 @Lazy 打破循环依赖。
     */
    @org.springframework.context.annotation.Lazy
    @Autowired
    private com.fashion.supplychain.warehouse.helper.FinishedOutstockHelper finishedOutstockHelper;

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

        // D-532：组合套装识别——平台商品编码命中 t_combo_product.combo_code 即套装订单。
        // skuCode 字段仍存 comboCode（保持"订单唯一商品编码"语义），销售/出库按组合口径处理
        com.fashion.supplychain.warehouse.entity.ComboProduct combo = resolveCombo(tenantId, order.getSkuCode());
        if (combo != null) {
            order.setComboId(combo.getId());
            order.setComboCode(combo.getComboCode());
            if (!StringUtils.hasText(order.getProductName())) {
                order.setProductName(combo.getComboName());
            }
            if (order.getUnitPrice() == null && combo.getSalePrice() != null) {
                order.setUnitPrice(combo.getSalePrice());
            }
        }

        ecOrderService.save(order);
        log.info("[EC接入] 平台={} 平台单号={} 内部单号={} tenantId={}", platformCode, platformOrderNo, order.getOrderNo(), tenantId);

        try {
            // D-532：组合套装订单没有款式/生产单，跳过款式匹配（套装按子SKU库存直接发货）
            if (combo != null) {
                log.info("[EC接入] 套装订单: orderNo={} combo={}({})", order.getOrderNo(), combo.getComboName(), combo.getComboCode());
            } else {
            // 优先用 body 里的 styleNo（聚水潭 i_id 直接=款号）；
            // 没有则按 skuCode 查 t_product_sku → t_style_info 权威解析款号。
            // 注意：真实 SKU 编码是"款号直接拼颜色尺码"（如 BR24XQ0098E草绿色L(170/84A)），
            // 曾用 split("-")[0] 猜款号，对真实数据恒等于整串，导致 EC↔生产 关联全部匹配不上。
            String styleNo = (String) body.getOrDefault("styleNo", "");
            if (!StringUtils.hasText(styleNo) && StringUtils.hasText(order.getSkuCode())) {
                styleNo = resolveStyleNoBySkuCode(tenantId, order.getSkuCode());
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
                    order.setProductionOrderId(matched.getId());
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
            }
        } catch (Exception e) {
            log.warn("[EC自动匹配] SKU匹配异常，不阻断接单: {}", e.getMessage());
        }

        // 智能仓库分配（D-532：组合套装订单无单一SKU可分配，跳过智能分仓）
        if (combo == null) {
            try {
                EcOrderProcessOrchestrator.OrderProcessResult result = orderProcessOrchestrator.processOrder(
                        tenantId, order.getId(), order.getOrderNo(),
                        null, null, order.getSkuCode(), order.getQuantity() != null ? order.getQuantity() : 0);
                log.info("[EcommerceOrderOrchestrator] 订单处理结果: orderNo={}, fullyAllocated={}, unfulfilled={}",
                        order.getOrderNo(), result.fullyAllocated(), result.unfulfilledQty());
            } catch (Exception e) {
                log.warn("[EcommerceOrderOrchestrator] 仓库分配失败，订单仍保留: orderNo={}", order.getOrderNo(), e);
            }
        }

        return Map.of("id", order.getId(), "orderNo", order.getOrderNo(), "duplicate", false);
    }

    /**
     * D-532：按平台商品编码识别组合商品（套装）。
     * 平台侧把套装作为独立商品上架时，商品编码 = t_combo_product.combo_code。
     */
    private com.fashion.supplychain.warehouse.entity.ComboProduct resolveCombo(Long tenantId, String skuCode) {
        if (!StringUtils.hasText(skuCode) || comboProductService == null) {
            return null;
        }
        try {
            return comboProductService.lambdaQuery()
                    .eq(com.fashion.supplychain.warehouse.entity.ComboProduct::getTenantId, tenantId)
                    .eq(com.fashion.supplychain.warehouse.entity.ComboProduct::getComboCode, skuCode)
                    .last("LIMIT 1")
                    .one();
        } catch (Exception e) {
            log.warn("[EC接入] 组合商品识别失败 skuCode={}: {}", skuCode, e.getMessage());
            return null;
        }
    }

    /**
     * 按 SKU 编码解析款号（权威口径：t_product_sku → t_style_info）。
     *
     * <p>不要用字符串切分猜款号：真实 SKU 编码是"款号直接拼颜色尺码"，
     * 例如 {@code BR24XQ0098E草绿色L(170/84A)}，不含分隔符。
     * 解析不到时返回 null，由调用方决定是否跳过匹配（不编造款号）。
     */
    private String resolveStyleNoBySkuCode(Long tenantId, String skuCode) {
        if (!StringUtils.hasText(skuCode) || productSkuService == null || styleInfoService == null) {
            return null;
        }
        try {
            ProductSku sku = productSkuService.getOne(new LambdaQueryWrapper<ProductSku>()
                    .eq(ProductSku::getSkuCode, skuCode)
                    .eq(ProductSku::getTenantId, tenantId)
                    .last("LIMIT 1"), false);
            if (sku == null || sku.getStyleId() == null) {
                return null;
            }
            StyleInfo style = styleInfoService.getById(sku.getStyleId());
            return style == null ? null : style.getStyleNo();
        } catch (Exception e) {
            log.warn("[EC自动匹配] SKU→款号解析失败 skuCode={}: {}", skuCode, e.getMessage());
            return null;
        }
    }

    public IPage<EcommerceOrder> listOrders(Map<String, Object> params) {
        int page = parseIntSafe(params.get("page"), 1);
        int pageSize = parseIntSafe(params.get("pageSize"), 20);
        LambdaQueryWrapper<EcommerceOrder> wrapper = buildListWrapper(params);
        return ecOrderService.page(new Page<>(page, pageSize), wrapper);
    }

    /**
     * 按日期范围统计销售额、订单量、运费、净收入，并按平台分组
     */
    public Map<String, Object> calcSalesStats(String startDate, String endDate) {
        Long tenantId = TenantAssert.requireTenantId();
        LambdaQueryWrapper<EcommerceOrder> wrapper = new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getTenantId, tenantId)
                .orderByDesc(EcommerceOrder::getCreateTime);
        applyDateRange(wrapper, startDate, endDate);

        List<EcommerceOrder> orders = ecOrderService.list(wrapper);

        java.math.BigDecimal totalPayAmount = java.math.BigDecimal.ZERO;
        java.math.BigDecimal totalFreight = java.math.BigDecimal.ZERO;
        java.math.BigDecimal netRevenue = java.math.BigDecimal.ZERO;
        int orderCount = 0;

        Map<String, PlatformStat> platformMap = new java.util.HashMap<>();
        for (EcommerceOrder order : orders) {
            if (order.getStatus() == null || order.getStatus() == 4) {
                continue; // 跳过已取消
            }
            java.math.BigDecimal pay = order.getPayAmount() != null ? order.getPayAmount() : java.math.BigDecimal.ZERO;
            java.math.BigDecimal freight = order.getFreight() != null ? order.getFreight() : java.math.BigDecimal.ZERO;
            java.math.BigDecimal revenue = pay.subtract(freight);

            totalPayAmount = totalPayAmount.add(pay);
            totalFreight = totalFreight.add(freight);
            netRevenue = netRevenue.add(revenue);
            orderCount++;

            String platform = StringUtils.hasText(order.getPlatform()) ? order.getPlatform() : "UNKNOWN";
            PlatformStat stat = platformMap.computeIfAbsent(platform, k -> new PlatformStat(platform));
            stat.orderCount++;
            stat.totalPayAmount = stat.totalPayAmount.add(pay);
            stat.netRevenue = stat.netRevenue.add(revenue);
        }

        List<Map<String, Object>> platformBreakdown = platformMap.values().stream()
                .map(s -> {
                    Map<String, Object> m = new java.util.HashMap<>();
                    m.put("platform", s.platform);
                    m.put("orderCount", s.orderCount);
                    m.put("totalPayAmount", s.totalPayAmount);
                    m.put("netRevenue", s.netRevenue);
                    return m;
                })
                .sorted((a, b) -> ((java.math.BigDecimal) b.get("totalPayAmount")).compareTo((java.math.BigDecimal) a.get("totalPayAmount")))
                .collect(Collectors.toList());

        Map<String, Object> result = new HashMap<>();
        result.put("orderCount", orderCount);
        result.put("totalPayAmount", totalPayAmount);
        result.put("totalFreight", totalFreight);
        result.put("netRevenue", netRevenue);
        result.put("platformBreakdown", platformBreakdown);
        return result;
    }

    private static class PlatformStat {
        String platform;
        int orderCount;
        java.math.BigDecimal totalPayAmount = java.math.BigDecimal.ZERO;
        java.math.BigDecimal netRevenue = java.math.BigDecimal.ZERO;

        PlatformStat(String platform) {
            this.platform = platform;
        }
    }

    private LambdaQueryWrapper<EcommerceOrder> buildListWrapper(Map<String, Object> params) {
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
        // 过滤空字符串：小程序"全部"状态发 '' 时不应解析为 -1（会查询不到任何订单）
        if (status != null && StringUtils.hasText(status.toString())) {
            wrapper.eq(EcommerceOrder::getStatus, parseIntSafe(status, -1));
        }

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
        return wrapper;
    }

    private void applyDateRange(LambdaQueryWrapper<EcommerceOrder> wrapper, String startDate, String endDate) {
        if (StringUtils.hasText(startDate)) {
            String start = startDate.trim();
            if (start.length() == 10) {
                wrapper.ge(EcommerceOrder::getCreateTime, start + " 00:00:00");
            } else {
                wrapper.ge(EcommerceOrder::getCreateTime, start);
            }
        }
        if (StringUtils.hasText(endDate)) {
            String end = endDate.trim();
            if (end.length() == 10) {
                wrapper.le(EcommerceOrder::getCreateTime, end + " 23:59:59");
            } else {
                wrapper.le(EcommerceOrder::getCreateTime, end);
            }
        }
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

        // 先查出生产订单：既用于回填 productionOrderId（保证「是否已关联生产」可被 SQL 直接判定），
        // 也用于回写 platformCode（仅在未设置时，避免覆盖人工设置）
        ProductionOrder prodOrder = null;
        try {
            prodOrder = productionOrderService.getOne(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .eq(ProductionOrder::getOrderNo, productionOrderNo)
                            .eq(ProductionOrder::getTenantId, tenantId));
        } catch (Exception e) {
            log.warn("[EC关联] 查询生产订单失败，仅写入单号: prodOrderNo={} {}", productionOrderNo, e.getMessage());
        }
        if (prodOrder != null) {
            order.setProductionOrderId(prodOrder.getId());
        } else {
            log.warn("[EC关联] 未找到生产订单 {}，productionOrderId 将保持为空", productionOrderNo);
        }
        ecOrderService.updateById(order);

        if (prodOrder != null && StringUtils.hasText(order.getPlatform())
                && !StringUtils.hasText(prodOrder.getPlatformCode())) {
            try {
                productionOrderService.lambdaUpdate()
                        .eq(ProductionOrder::getId, prodOrder.getId())
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .set(ProductionOrder::getPlatformCode, order.getPlatform())
                        .update();
                log.info("[EC关联] 回写 platformCode 到生产订单: prodOrderNo={} platform={}",
                        productionOrderNo, order.getPlatform());
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
        if (order.getComboId() != null) {
            // D-532：组合套装订单——按子SKU逐个扣库存出库（复用套装出库链路：
            // 原子扣减防超卖、每子SKU一行出库记录、共一张出库单号、行挂组合溯源）
            Map<String, Object> comboParams = new java.util.HashMap<>();
            comboParams.put("comboId", order.getComboId());
            comboParams.put("quantity", quantity);
            if (order.getUnitPrice() != null) {
                comboParams.put("salesPrice", order.getUnitPrice());
            }
            String customer = StringUtils.hasText(order.getReceiverName()) ? order.getReceiverName() : order.getBuyerNick();
            if (StringUtils.hasText(customer)) comboParams.put("customerName", customer);
            if (StringUtils.hasText(order.getReceiverPhone())) comboParams.put("customerPhone", order.getReceiverPhone());
            if (StringUtils.hasText(order.getReceiverAddress())) comboParams.put("shippingAddress", order.getReceiverAddress());
            if (StringUtils.hasText(trackingNo)) comboParams.put("trackingNo", trackingNo);
            if (StringUtils.hasText(expressCompany)) comboParams.put("expressCompany", expressCompany);
            comboParams.put("outstockType", "shipment");
            comboParams.put("remark", "电商订单发货 " + order.getOrderNo());
            Map<String, Object> comboResult = finishedOutstockHelper.comboOutbound(comboParams);
            log.info("[EC现货出库] 套装订单出库完成: orderNo={}, combo={}, 套数={}, 出库单号={}",
                    order.getOrderNo(), order.getComboCode(), quantity, comboResult.get("outstockNo"));
        } else if (StringUtils.hasText(skuCode)) {
            boolean deducted = productSkuService.decreaseStockBySkuCode(skuCode, quantity);
            if (!deducted) {
                throw new IllegalStateException(
                        "库存不足: SKU=" + skuCode + "，请先入库再出库，或检查库存数量");
            }
            log.info("[EC现货出库] SKU库存已扣减: skuCode={} quantity={}", skuCode, quantity);
        }

        // D-800：EC 现货发货补写 t_product_outstock 出库流水。
        // 【为什么必须补】原来这条链路只扣 SKU 库存 + 改 EC 单状态，**一行出库流水都不写**，
        // 导致：① t_product_outstock 里查不到任何电商销量；② 销量趋势/渠道分析对电商全是空；
        //      ③ 店铺/POS 都有流水而唯独电商没有，口径不统一。
        // 套装分支已在 comboOutbound 内写过流水，此处只补非套装分支（避免重复记账）。
        // 【为什么用 stockAlreadyDeducted=true】库存已在上面扣过，outbound() 里不能再扣一次。
        if (order.getComboId() == null && StringUtils.hasText(skuCode)) {
            recordEcOutboundFlow(order, skuCode, quantity, trackingNo, expressCompany);
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
        }

    /**
     * D-800：EC 现货发货补写出库台账（t_product_outstock）。
     *
     * <p>【背景】EC 现货出库链路原本只扣 SKU 库存 + 改 EC 单状态，不写任何出库流水，
     * 导致电商销量在出库台账里完全缺失，销量趋势与渠道分析对电商永远是空的。
     *
     * <p>【为什么不复用 comboOutbound】套装分支已在上面走过 comboOutbound（含组合溯源三列），
     * 这里只处理非套装单SKU，避免重复记账导致库存与销量双扣。
     *
     * <p>【幂等】同一 EC 单重复调用会被 warehouseStatus >= 2 的前置校验拦掉，
     * 因此不会重复写流水。
     *
     * <p>【失败不阻断】台账补记失败只告警不抛 —— 库存已经扣了、订单已发货，
     * 此时抛异常会让整个事务回滚、货发不出去。台账缺失可由对账补录修复。
     */
    private void recordEcOutboundFlow(EcommerceOrder order, String skuCode, int quantity,
                                      String trackingNo, String expressCompany) {
        try {
            Map<String, Object> params = new java.util.HashMap<>();
            List<Map<String, Object>> items = new ArrayList<>();
            Map<String, Object> item = new java.util.HashMap<>();
            item.put("sku", skuCode);
            item.put("quantity", quantity);
            // 不传 salesPrice：出库台账沿用 SKU 挂牌售价（与店铺/POS 口径一致）。
            // EC 实际成交价（可能含优惠/运费）由 t_ec_sales_revenue.pay_amount 承担，
            // 两表职责不同：台账记「出库了什么」，收入表记「实际收了多少钱」。
            items.add(item);
            params.put("items", items);
            params.put("outstockType", OutstockTypeConstants.SHIPMENT);
            // 库存已在本方法调用方扣过，这里只补台账
            params.put("stockAlreadyDeducted", true);
            // 订单关联：写平台单号与平台渠道，供销量趋势按渠道拆分。
            // 注意 orderId 故意不传 t_production_order.id —— 该列有指向生产订单的外键，
            // 传 EC 单 id 会造成错误关联，故只用 orderNo/platform 文本维度关联。
            params.put("orderNo", order.getPlatformOrderNo() != null && !order.getPlatformOrderNo().isBlank()
                    ? order.getPlatformOrderNo() : order.getOrderNo());
            params.put("platformCode", OutstockTypeConstants.ecChannel(order.getPlatform()));
            String customer = StringUtils.hasText(order.getReceiverName())
                    ? order.getReceiverName() : order.getBuyerNick();
            if (StringUtils.hasText(customer)) {
                params.put("customerName", customer);
            }
            if (StringUtils.hasText(order.getReceiverPhone())) {
                params.put("customerPhone", order.getReceiverPhone());
            }
            if (StringUtils.hasText(order.getReceiverAddress())) {
                params.put("shippingAddress", order.getReceiverAddress());
            }
            if (StringUtils.hasText(trackingNo)) {
                params.put("trackingNo", trackingNo);
            }
            if (StringUtils.hasText(expressCompany)) {
                params.put("expressCompany", expressCompany);
            }
            params.put("remark", "电商发货 " + order.getOrderNo()
                    + (StringUtils.hasText(order.getShopName()) ? "|" + order.getShopName() : ""));
            finishedOutstockHelper.outbound(params);
            log.info("[EC现货出库] 出库台账已补记: ecOrderNo={} sku={} qty={} platform={}",
                    order.getOrderNo(), skuCode, quantity, OutstockTypeConstants.ecChannel(order.getPlatform()));
        } catch (Exception e) {
            log.error("[EC现货出库] 出库台账补记失败（不阻断发货，需人工对账补录）: ecOrderNo={} sku={} qty={} err={}",
                    order.getOrderNo(), skuCode, quantity, e.getMessage(), e);
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
            platformNotifyHelper.notifyShipped(order);
        } catch (Exception e) {
            log.warn("[EC出库回写] 物流回传失败: {}", e.getMessage());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public int onLogisticsDelivered(String trackingNo, String expressCompany, LocalDateTime signTime) {
        if (!StringUtils.hasText(trackingNo)) return 0;
        Long tenantId = TenantAssert.requireTenantId();
        LambdaQueryWrapper<EcommerceOrder> wrapper = new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getTrackingNo, trackingNo)
                .eq(EcommerceOrder::getTenantId, tenantId)
                .in(EcommerceOrder::getStatus, 1, 2);
        List<EcommerceOrder> orders = ecOrderService.list(wrapper);
        if (orders.isEmpty()) {
            log.info("[EC签收回写] 未找到匹配订单 | trackingNo={}", trackingNo);
            return 0;
        }
        int updated = 0;
        for (EcommerceOrder order : orders) {
            order.setStatus(3);
            order.setCompleteTime(signTime != null ? signTime : LocalDateTime.now());
            ecOrderService.updateById(order);
            updated++;
            log.info("[EC签收回写] 订单已完成 | orderNo={} trackingNo={}", order.getOrderNo(), trackingNo);
        }
        return updated;
    }

    @Transactional(rollbackFor = Exception.class)
    public int onLogisticsDeliveredByTrackingNo(String trackingNo, String expressCompany, LocalDateTime signTime) {
        if (!StringUtils.hasText(trackingNo)) return 0;
        LambdaQueryWrapper<EcommerceOrder> wrapper = new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getTrackingNo, trackingNo)
                .in(EcommerceOrder::getStatus, 1, 2);
        List<EcommerceOrder> orders = ecOrderService.list(wrapper);
        if (orders.isEmpty()) {
            log.info("[EC签收回写(无租户)] 未找到匹配订单 | trackingNo={}", trackingNo);
            return 0;
        }
        int updated = 0;
        for (EcommerceOrder order : orders) {
            order.setStatus(3);
            order.setCompleteTime(signTime != null ? signTime : LocalDateTime.now());
            ecOrderService.updateById(order);
            updated++;
            log.info("[EC签收回写(无租户)] 订单已完成 | orderNo={} trackingNo={} tenantId={}",
                    order.getOrderNo(), trackingNo, order.getTenantId());
        }
        return updated;
    }

    /** 平台编码映射常量（统一管理，避免三处 switch 重复）
     *  FULL_TO_SHORT: 全码 → 短码（如 TAOBAO → TB）
     *  SHORT_TO_FULL: 短码 → 全码（如 TB → TAOBAO）
     */
    private static final Map<String, String> FULL_TO_SHORT = Map.of(
            "TAOBAO", "TB", "TMALL", "TM", "JD", "JD", "DOUYIN", "DY",
            "PINDUODUO", "PDD", "XIAOHONGSHU", "XHS", "WECHAT_SHOP", "WC",
            "SHOPIFY", "SFY", "SHEIN", "SY", "JST", "JST"
    );
    private static final Map<String, String> SHORT_TO_FULL = Map.of(
            "TB", "TAOBAO", "TM", "TMALL", "JD", "JD", "DY", "DOUYIN",
            "PDD", "PINDUODUO", "XHS", "XIAOHONGSHU", "WC", "WECHAT_SHOP",
            "SFY", "SHOPIFY", "SY", "SHEIN", "JST", "JST"
    );

    private String genOrderNo(String platformCode) {
        String prefix = FULL_TO_SHORT.getOrDefault(platformCode, "EC");
        return prefix + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyMMddHHmmssSSS"));
    }

    private String toPlatformAbbr(String code) {
        if (code == null) return null;
        return FULL_TO_SHORT.getOrDefault(code, code);
    }

    /** 短码 → 全码（用于 platform 筛选兼容） */
    private String expandPlatformCode(String shortCode) {
        if (shortCode == null) return null;
        return SHORT_TO_FULL.get(shortCode.toUpperCase());
    }

    private int parseIntSafe(Object val, int defaultVal) {
        if (val == null) return defaultVal;
        try { return Integer.parseInt(val.toString()); } catch (Exception e) { return defaultVal; }
    }

    // ==================== 赠品规则（D-647 自 EcommerceOrderController 下沉） ====================

    /** 查询全部赠品规则（含禁用） */
    public List<EcGiftRule> listGiftRules(Long tenantId) {
        return giftRuleService.listByTenant(tenantId);
    }

    /** 保存赠品规则（新增/更新），补齐租户与默认值 */
    public EcGiftRule saveGiftRule(Long tenantId, EcGiftRule rule) {
        rule.setTenantId(tenantId);
        if (rule.getEnabled() == null) rule.setEnabled(1);
        if (rule.getDeleteFlag() == null) rule.setDeleteFlag(0);
        if (rule.getGiftQuantity() == null) rule.setGiftQuantity(1);
        giftRuleService.saveOrUpdate(rule);
        return rule;
    }

    /** 删除赠品规则（软删除） */
    public void deleteGiftRule(Long tenantId, Long id) {
        giftRuleService.softDelete(tenantId, id);
    }

    /** 匹配赠品：根据订单金额/数量/平台返回命中的赠品 */
    public List<EcGiftRuleService.GiftMatch> matchGifts(Long tenantId, BigDecimal amount,
                                                        Integer quantity, String platformCode) {
        return giftRuleService.matchGifts(tenantId, amount, quantity, platformCode);
    }
}
