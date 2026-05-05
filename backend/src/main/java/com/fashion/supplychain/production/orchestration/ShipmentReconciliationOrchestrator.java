package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.helper.ExternalFactoryMaterialDeductionHelper;
import com.fashion.supplychain.production.helper.OrderReconciliationHelper;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.ThreadLocalRandom;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service("productionShipmentReconciliationOrchestrator")
@Slf4j
public class ShipmentReconciliationOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductOutstockService productOutstockService;

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleQuotationService styleQuotationService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private OrderReconciliationHelper orderReconciliationHelper;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ExternalFactoryMaterialDeductionHelper externalFactoryMaterialDeductionHelper;

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public boolean ensureShipmentReconciliationForOrder(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) throw new IllegalArgumentException("参数错误");

        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "生产订单");

        Map<String, Object> orderDetails = parseOrderDetails(order);
        String customerId = resolveCustomerId(orderDetails);
        String customerName = resolveCustomerName(orderDetails);

        int shippedQty = resolveShippedQuantityAndCleanup(oid);
        if (shippedQty <= 0) return false;

        LocalDateTime now = LocalDateTime.now();
        String uid = resolveCurrentUserId();
        ShipmentReconciliation sr = findExistingReconciliation(oid, order.getOrderNo());
        boolean created = (sr == null);

        if (created) {
            sr = buildNewReconciliation(order, now, uid);
        } else {
            if (patchNonPendingReconciliation(sr, order, customerId, customerName, uid, now)) return true;
        }

        fillReconciliationFields(sr, order, customerId, customerName);
        resolveUnitPriceAndCalculateAmounts(order, sr, shippedQty, oid);
        saveReconciliationWithMetadata(sr, uid, now);

        try {
            externalFactoryMaterialDeductionHelper.attachOrphanDeductionsToReconciliation(
                    oid, order.getOrderNo(), sr.getId());
        } catch (Exception e) {
            log.warn("归集暂存扣款失败(不影响主流程): orderId={}", oid, e);
        }

        return true;
    }

    private int resolveShippedQuantityAndCleanup(String oid) {
        int shippedQty = productOutstockService.sumOutstockByOrderId(oid);
        if (shippedQty <= 0) {
            try {
                ShipmentReconciliation existed = shipmentReconciliationService.lambdaQuery()
                        .select(ShipmentReconciliation::getId, ShipmentReconciliation::getStatus)
                        .eq(ShipmentReconciliation::getOrderId, oid)
                        .orderByDesc(ShipmentReconciliation::getCreateTime)
                        .last("limit 1")
                        .one();
                if (existed != null && StringUtils.hasText(existed.getId())) {
                    String st = existed.getStatus() == null ? "" : existed.getStatus().trim();
                    if (!StringUtils.hasText(st) || "pending".equalsIgnoreCase(st)) {
                        shipmentReconciliationService.removeById(existed.getId().trim());
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to cleanup pending shipment reconciliation when no outstock quantity: orderId={}", oid, e);
            }
        }
        return shippedQty;
    }

    private String resolveCurrentUserId() {
        try {
            UserContext ctx = UserContext.get();
            String tmpUid = ctx == null ? null : ctx.getUserId();
            if (tmpUid != null) {
                String normalizedUid = tmpUid.trim();
                if (!normalizedUid.isEmpty()) return normalizedUid;
            }
        } catch (Exception e) {
            log.warn("[Finance] 用户信息获取失败: {}", e.getMessage());
        }
        return null;
    }

    private ShipmentReconciliation findExistingReconciliation(String oid, String orderNo) {
        ShipmentReconciliation sr = null;
        try {
            sr = shipmentReconciliationService.lambdaQuery()
                    .eq(ShipmentReconciliation::getOrderId, oid)
                    .orderByDesc(ShipmentReconciliation::getCreateTime)
                    .last("limit 1")
                    .one();
        } catch (Exception e) {
            log.warn("Failed to query existing shipment reconciliation: orderId={}", oid, e);
        }
        if (sr == null && StringUtils.hasText(orderNo)) {
            try {
                sr = shipmentReconciliationService.lambdaQuery()
                        .eq(ShipmentReconciliation::getOrderNo, orderNo.trim())
                        .orderByDesc(ShipmentReconciliation::getCreateTime)
                        .last("limit 1")
                        .one();
            } catch (Exception e) {
                log.warn("Failed to query existing shipment reconciliation by orderNo: orderId={}, orderNo={}", oid, orderNo, e);
            }
        }
        return sr;
    }

    private ShipmentReconciliation buildNewReconciliation(ProductionOrder order, LocalDateTime now, String uid) {
        ShipmentReconciliation sr = new ShipmentReconciliation();
        sr.setReconciliationNo(buildFinanceNo("SR", now));
        sr.setCustomerId(null);
        sr.setCustomerName("");
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setStyleName(order.getStyleName());
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStatus("pending");
        sr.setCreateTime(now);
        if (StringUtils.hasText(uid)) {
            sr.setCreateBy(uid);
            sr.setUpdateBy(uid);
        }
        return sr;
    }

    private boolean patchNonPendingReconciliation(ShipmentReconciliation sr, ProductionOrder order,
            String customerId, String customerName, String uid, LocalDateTime now) {
        String st = sr.getStatus() == null ? "" : sr.getStatus().trim();
        if (!StringUtils.hasText(st) || "pending".equalsIgnoreCase(st)) return false;

        ShipmentReconciliation patch = new ShipmentReconciliation();
        patch.setId(sr.getId());
        boolean needPatch = false;

        if (!StringUtils.hasText(sr.getStyleId()) && StringUtils.hasText(order.getStyleId())) { patch.setStyleId(order.getStyleId()); needPatch = true; }
        if (!StringUtils.hasText(sr.getStyleNo()) && StringUtils.hasText(order.getStyleNo())) { patch.setStyleNo(order.getStyleNo()); needPatch = true; }
        if (!StringUtils.hasText(sr.getStyleName()) && StringUtils.hasText(order.getStyleName())) { patch.setStyleName(order.getStyleName()); needPatch = true; }
        if (!StringUtils.hasText(sr.getOrderId()) && StringUtils.hasText(order.getId())) { patch.setOrderId(order.getId()); needPatch = true; }
        if (!StringUtils.hasText(sr.getOrderNo()) && StringUtils.hasText(order.getOrderNo())) { patch.setOrderNo(order.getOrderNo()); needPatch = true; }
        if (!StringUtils.hasText(sr.getCustomerId()) && StringUtils.hasText(customerId)) { patch.setCustomerId(customerId); needPatch = true; }
        if (!StringUtils.hasText(sr.getCustomerName()) && StringUtils.hasText(customerName)) { patch.setCustomerName(customerName); needPatch = true; }

        if (needPatch) {
            patch.setUpdateTime(now);
            if (StringUtils.hasText(uid)) {
                patch.setUpdateBy(uid);
                if (!StringUtils.hasText(sr.getCreateBy())) patch.setCreateBy(uid);
            }
            shipmentReconciliationService.updateById(patch);
        }
        return true;
    }

    private void fillReconciliationFields(ShipmentReconciliation sr, ProductionOrder order,
            String customerId, String customerName) {
        if (!StringUtils.hasText(sr.getStyleId())) sr.setStyleId(order.getStyleId());
        if (!StringUtils.hasText(sr.getStyleNo())) sr.setStyleNo(order.getStyleNo());
        if (!StringUtils.hasText(sr.getStyleName())) sr.setStyleName(order.getStyleName());
        if (!StringUtils.hasText(sr.getOrderId())) sr.setOrderId(order.getId());
        if (!StringUtils.hasText(sr.getOrderNo())) sr.setOrderNo(order.getOrderNo());
        if (StringUtils.hasText(customerId) && !StringUtils.hasText(sr.getCustomerId())) sr.setCustomerId(customerId);
        if (StringUtils.hasText(customerName) && !StringUtils.hasText(sr.getCustomerName())) sr.setCustomerName(customerName);
    }

    private void resolveUnitPriceAndCalculateAmounts(ProductionOrder order, ShipmentReconciliation sr,
            int shippedQty, String oid) {
        BigDecimal unitPrice = sr.getUnitPrice();
        if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            unitPrice = resolveUnitPriceFromQuotation(order);
            if (unitPrice != null && unitPrice.compareTo(BigDecimal.ZERO) > 0) {
                sr.setUnitPrice(unitPrice);
            }
        }

        sr.setQuantity(Math.max(0, shippedQty));
        boolean isOwnFactory = orderReconciliationHelper != null && orderReconciliationHelper.isOwnFactory(order);

        if (isOwnFactory) {
            BigDecimal scanCost = BigDecimal.ZERO;
            try {
                scanCost = calculateScanCostForOrder(oid);
            } catch (Exception e) {
                log.warn("计算扫码成本失败: orderId={}", oid, e);
            }
            sr.setUnitPrice(BigDecimal.ZERO);
            sr.setTotalAmount(scanCost);
            sr.setFinalAmount(scanCost);
            if (sr.getDeductionAmount() == null) sr.setDeductionAmount(BigDecimal.ZERO);
        } else {
            BigDecimal up = sr.getUnitPrice();
            if (up == null || up.compareTo(BigDecimal.ZERO) <= 0) {
                up = resolveLastUnitPrice(oid, "shipment");
                if (up == null || up.compareTo(BigDecimal.ZERO) <= 0) {
                    up = resolveUnitPriceFromStyleInfo(order.getStyleNo());
                }
            }
            BigDecimal factoryUnitPrice = order.getFactoryUnitPrice() != null ? order.getFactoryUnitPrice() : BigDecimal.ZERO;
            if (factoryUnitPrice.compareTo(BigDecimal.ZERO) > 0) up = factoryUnitPrice;

            sr.setUnitPrice(up);
            if (sr.getDeductionAmount() == null) sr.setDeductionAmount(BigDecimal.ZERO);
            if (up == null) { up = BigDecimal.ZERO; sr.setUnitPrice(up); }
            BigDecimal total = up.multiply(BigDecimal.valueOf(Math.max(0, shippedQty))).setScale(2, RoundingMode.HALF_UP);
            sr.setTotalAmount(total);
            sr.setFinalAmount(total.subtract(sr.getDeductionAmount()).setScale(2, RoundingMode.HALF_UP));
        }

        try {
            java.lang.reflect.Method setOwn = sr.getClass().getMethod("setIsOwnFactory", Integer.class);
            setOwn.invoke(sr, isOwnFactory ? 1 : 0);
        } catch (Exception e) {
            log.warn("[FinanceOrch] 设置isOwnFactory失败: orderId={}, error={}", sr.getId(), e.getMessage());
        }
    }

    private BigDecimal resolveUnitPriceFromQuotation(ProductionOrder order) {
        try {
            if (StringUtils.hasText(order.getStyleId())) {
                String sidRaw = order.getStyleId().trim();
                if (StringUtils.hasText(sidRaw) && isAllDigits(sidRaw)) {
                    Long styleId = Long.parseLong(sidRaw);
                    StyleQuotation quotation = styleQuotationService.getByStyleId(styleId);
                    if (quotation != null && quotation.getTotalPrice() != null
                            && quotation.getTotalPrice().compareTo(BigDecimal.ZERO) > 0) {
                        return quotation.getTotalPrice();
                    }
                } else if (StringUtils.hasText(order.getStyleNo())) {
                    StyleInfo styleInfo = styleInfoService.lambdaQuery()
                            .eq(StyleInfo::getStyleNo, order.getStyleNo().trim())
                            .one();
                    if (styleInfo != null) {
                        StyleQuotation quotation = styleQuotationService.getByStyleId(styleInfo.getId());
                        if (quotation != null && quotation.getTotalPrice() != null
                                && quotation.getTotalPrice().compareTo(BigDecimal.ZERO) > 0) {
                            return quotation.getTotalPrice();
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to get unit price from style quotation: styleId={}, styleNo={}", order.getStyleId(), order.getStyleNo(), e);
        }
        return null;
    }

    private BigDecimal resolveUnitPriceFromStyleInfo(String styleNo) {
        if (!StringUtils.hasText(styleNo)) return null;
        try {
            StyleInfo styleInfo = styleInfoService.getOne(new LambdaQueryWrapper<StyleInfo>()
                    .eq(StyleInfo::getStyleNo, styleNo.trim())
                    .last("limit 1"));
            if (styleInfo != null && styleInfo.getPrice() != null
                    && styleInfo.getPrice().compareTo(BigDecimal.ZERO) > 0) {
                return styleInfo.getPrice();
            }
        } catch (Exception e) {
            log.warn("Failed to resolve style price: styleNo={}", styleNo, e);
        }
        return null;
    }

    private void saveReconciliationWithMetadata(ShipmentReconciliation sr, String uid, LocalDateTime now) {
        sr.setReconciliationDate(now);
        sr.setUpdateTime(now);
        if (StringUtils.hasText(uid)) {
            sr.setUpdateBy(uid);
            if (!StringUtils.hasText(sr.getCreateBy())) sr.setCreateBy(uid);
        }
        shipmentReconciliationService.saveOrUpdate(sr);
    }

    private Map<String, Object> parseOrderDetails(ProductionOrder order) {
        if (order == null || !StringUtils.hasText(order.getOrderDetails())) {
            return null;
        }
        try {
            String json = order.getOrderDetails().trim();
            if (json.startsWith("[")) {
                java.util.List<Map<String, Object>> list = objectMapper.readValue(json,
                    new TypeReference<java.util.List<Map<String, Object>>>() {});
                return (list != null && !list.isEmpty()) ? list.get(0) : null;
            }
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception e) {
            log.warn("Failed to parse production order orderDetails: orderId={}", order.getId(), e);
            return null;
        }
    }

    private String resolveCustomerId(Map<String, Object> details) {
        String v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(details, "customerId"));
        if (StringUtils.hasText(v)) {
            return v;
        }
        v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(details, "customer_id"));
        if (StringUtils.hasText(v)) {
            return v;
        }
        Object customer = ParamUtils.getIgnoreCase(details, "customer");
        if (customer instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) customer;
            v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(m, "id"));
            if (StringUtils.hasText(v)) {
                return v;
            }
            v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(m, "customerId"));
            if (StringUtils.hasText(v)) {
                return v;
            }
        }
        return null;
    }

    private String resolveCustomerName(Map<String, Object> details) {
        String v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(details, "customerName"));
        if (StringUtils.hasText(v)) {
            return v;
        }
        v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(details, "customer_name"));
        if (StringUtils.hasText(v)) {
            return v;
        }
        Object customer = ParamUtils.getIgnoreCase(details, "customer");
        if (customer instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) customer;
            v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(m, "name"));
            if (StringUtils.hasText(v)) {
                return v;
            }
            v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(m, "customerName"));
            if (StringUtils.hasText(v)) {
                return v;
            }
        }
        v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(details, "customer"));
        return StringUtils.hasText(v) ? v : null;
    }

    private BigDecimal resolveLastUnitPrice(String orderId, String type) {
        if (!StringUtils.hasText(orderId)) {
            return null;
        }
        String oid = orderId.trim();
        String tp = StringUtils.hasText(type) ? type.trim().toLowerCase() : "";

        try {
            if ("shipment".equals(tp)) {
                ShipmentReconciliation sr = shipmentReconciliationService.lambdaQuery()
                        .select(ShipmentReconciliation::getUnitPrice)
                        .eq(ShipmentReconciliation::getOrderId, oid)
                        .orderByDesc(ShipmentReconciliation::getCreateTime)
                        .last("limit 1")
                        .one();
                return sr == null ? null : sr.getUnitPrice();
            }
            return null;
        } catch (Exception e) {
            log.warn("Failed to resolve last unit price: orderId={}, type={}", oid, tp, e);
            return null;
        }
    }

    private String buildFinanceNo(String prefix, LocalDateTime now) {
        LocalDateTime t = now == null ? LocalDateTime.now() : now;
        String p = StringUtils.hasText(prefix) ? prefix.trim().toUpperCase() : "NO";
        String ts = t.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        String rand = String.valueOf((int) (ThreadLocalRandom.current().nextDouble() * 9000) + 1000);
        return p + ts + rand;
    }

    private BigDecimal calculateScanCostForOrder(String orderId) {
        try {
            List<ScanRecord> scans = scanRecordService.list(
                new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId)
                    .ne(ScanRecord::getScanType, "orchestration")
                    .eq(ScanRecord::getScanResult, "success")
                    .isNull(ScanRecord::getFactoryId)
            );
            return scans.stream()
                .map(s -> s.getScanCost() != null ? s.getScanCost() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        } catch (Exception e) {
            log.warn("计算扫码成本失败: orderId={}", orderId, e);
            return BigDecimal.ZERO;
        }
    }

    private static boolean isAllDigits(String s) {
        if (s == null || s.isEmpty()) {
            return false;
        }
        for (int i = 0; i < s.length(); i++) {
            if (!Character.isDigit(s.charAt(i))) {
                return false;
            }
        }
        return true;
    }
}
