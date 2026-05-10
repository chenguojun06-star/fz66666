package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.fashion.supplychain.warehouse.entity.WarehouseArea;
import com.fashion.supplychain.warehouse.service.WarehouseAreaService;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

@Service
@Slf4j
@RequiredArgsConstructor
public class FinishedWarehouseOperationOrchestrator {

    private final ProductSkuService productSkuService;
    private final ProductWarehousingMapper productWarehousingMapper;
    private final ProductOutstockService productOutstockService;
    private final StyleInfoService styleInfoService;
    private final WarehouseAreaService warehouseAreaService;

    private static final Set<String> VALID_SOURCE_TYPES = Set.of(
            "external_purchase", "free_inbound", "transfer_in", "return_in", "other_in", "scan_inbound");

    private static final Set<String> VALID_OUTSTOCK_TYPES = Set.of(
            "free_outbound", "sample_out", "damage_out", "transfer_out", "other_out", "scan_outbound");

    @Transactional(rollbackFor = Exception.class)
    public ProductWarehousing freeInbound(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        String username = UserContext.username();

        String skuCode = trimToNull(params.get("skuCode"));
        Integer quantity = toInt(params.get("quantity"));
        String warehouseLocation = trimToNull(params.get("warehouseLocation"));
        String sourceType = trimToNull(params.get("sourceType"));
        String remark = trimToNull(params.get("remark"));
        String supplierName = trimToNull(params.get("supplierName"));
        BigDecimal unitPrice = toBigDecimal(params.get("unitPrice"));
        Boolean autoCreateSku = params.get("autoCreateSku") != null
                && Boolean.parseBoolean(String.valueOf(params.get("autoCreateSku")));
        String styleNo = trimToNull(params.get("styleNo"));
        String styleName = trimToNull(params.get("styleName"));
        String color = trimToNull(params.get("color"));
        String size = trimToNull(params.get("size"));
        String warehouseAreaId = trimToNull(params.get("warehouseAreaId"));

        if (!StringUtils.hasText(skuCode)) {
            throw new IllegalArgumentException("SKU编码不能为空");
        }
        if (quantity == null || quantity <= 0) {
            throw new IllegalArgumentException("入库数量必须大于0");
        }
        if (!StringUtils.hasText(warehouseLocation)) {
            warehouseLocation = "默认仓";
        }
        if (!StringUtils.hasText(sourceType)) {
            sourceType = "free_inbound";
        }
        if (!VALID_SOURCE_TYPES.contains(sourceType)) {
            throw new IllegalArgumentException("不支持的入库来源类型: " + sourceType);
        }

        String warehouseAreaName = null;
        if (StringUtils.hasText(warehouseAreaId)) {
            WarehouseArea area = warehouseAreaService.getById(warehouseAreaId);
            if (area != null) {
                warehouseAreaName = area.getAreaName();
            }
        }

        ProductSku sku = productSkuService.getOne(
                new LambdaQueryWrapper<ProductSku>().eq(ProductSku::getSkuCode, skuCode));

        if (sku == null) {
            if (!autoCreateSku) {
                throw new IllegalArgumentException("SKU不存在: " + skuCode
                        + "。如需自动创建，请传入 autoCreateSku=true 并提供 styleNo/color/size");
            }
            sku = autoCreateSkuAndStyle(skuCode, styleNo, styleName, color, size, unitPrice, tenantId);
        }

        productSkuService.updateStock(skuCode, quantity);
        log.info("[成品入库] skuCode={} +{} 来源={}", skuCode, quantity, sourceType);

        ProductWarehousing w = new ProductWarehousing();
        LocalDateTime now = LocalDateTime.now();
        w.setId(UUID.randomUUID().toString().replace("-", ""));
        w.setWarehousingNo(buildNo("FI", now));
        w.setStyleId(sku.getStyleId() != null ? String.valueOf(sku.getStyleId()) : null);
        w.setStyleNo(sku.getStyleNo());
        StyleInfo style = sku.getStyleId() != null ? styleInfoService.getById(sku.getStyleId()) : null;
        w.setStyleName(style != null ? style.getStyleName() : (styleName != null ? styleName : null));
        w.setWarehousingQuantity(quantity);
        w.setQualifiedQuantity(quantity);
        w.setUnqualifiedQuantity(0);
        w.setWarehousingType(sourceType);
        w.setWarehouse(warehouseLocation);
        w.setWarehouseAreaId(warehouseAreaId);
        w.setWarehouseAreaName(warehouseAreaName);
        w.setQualityStatus("qualified");
        w.setWarehousingOperatorId(userId);
        w.setWarehousingOperatorName(username);
        w.setWarehousingEndTime(now);
        w.setSkuCode(skuCode);
        w.setColor(sku.getColor());
        w.setSize(sku.getSize());
        w.setDefectRemark(remark);
        w.setFactoryName(supplierName);
        w.setCreateTime(now);
        w.setUpdateTime(now);
        w.setDeleteFlag(0);
        w.setTenantId(tenantId);
        productWarehousingMapper.insert(w);
        return w;
    }

    ProductSku autoCreateSkuAndStyle(String skuCode, String styleNo, String styleName,
                                      String color, String size, BigDecimal unitPrice, Long tenantId) {
        String[] parts = skuCode.split("-", 3);
        String resolvedStyleNo = StringUtils.hasText(styleNo) ? styleNo
                : (parts.length >= 1 ? parts[0] : skuCode);
        String resolvedColor = StringUtils.hasText(color) ? color
                : (parts.length >= 2 ? parts[1] : "默认色");
        String resolvedSize = StringUtils.hasText(size) ? size
                : (parts.length >= 3 ? parts[2] : "均码");

        StyleInfo style = styleInfoService.getOne(
                new LambdaQueryWrapper<StyleInfo>()
                        .eq(StyleInfo::getStyleNo, resolvedStyleNo)
                        .eq(StyleInfo::getTenantId, tenantId)
                        .last("LIMIT 1"));

        if (style == null) {
            style = new StyleInfo();
            style.setStyleNo(resolvedStyleNo);
            style.setStyleName(StringUtils.hasText(styleName) ? styleName : resolvedStyleNo);
            style.setPrice(unitPrice);
            style.setStatus("ENABLED");
            style.setTenantId(tenantId);
            style.setYear(LocalDateTime.now().getYear());
            style.setSkuMode("AUTO");
            styleInfoService.save(style);
            log.info("[成品入库] 自动创建款号: styleNo={}, id={}", resolvedStyleNo, style.getId());
        }

        ProductSku newSku = new ProductSku();
        newSku.setSkuCode(skuCode);
        newSku.setStyleId(style.getId());
        newSku.setStyleNo(resolvedStyleNo);
        newSku.setColor(resolvedColor);
        newSku.setSize(resolvedSize);
        newSku.setStatus("ENABLED");
        newSku.setStockQuantity(0);
        newSku.setSalesPrice(unitPrice != null ? unitPrice : style.getPrice());
        newSku.setCostPrice(unitPrice);
        newSku.setSkuMode("AUTO");
        newSku.setTenantId(tenantId);
        productSkuService.save(newSku);
        log.info("[成品入库] 自动创建SKU: skuCode={}, styleId={}", skuCode, style.getId());
        return newSku;
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductOutstock freeOutbound(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        String skuCode = trimToNull(params.get("skuCode"));
        Integer quantity = toInt(params.get("quantity"));
        String warehouseLocation = trimToNull(params.get("warehouseLocation"));
        String outstockType = trimToNull(params.get("outstockType"));
        String remark = trimToNull(params.get("remark"));
        String customerName = trimToNull(params.get("customerName"));
        String customerPhone = trimToNull(params.get("customerPhone"));
        String shippingAddress = trimToNull(params.get("shippingAddress"));
        String warehouseAreaId = trimToNull(params.get("warehouseAreaId"));

        if (!StringUtils.hasText(skuCode)) {
            throw new IllegalArgumentException("SKU编码不能为空");
        }
        if (quantity == null || quantity <= 0) {
            throw new IllegalArgumentException("出库数量必须大于0");
        }
        if (!StringUtils.hasText(outstockType)) {
            outstockType = "free_outbound";
        }
        if (!VALID_OUTSTOCK_TYPES.contains(outstockType)) {
            throw new IllegalArgumentException("不支持的出库类型: " + outstockType);
        }

        String warehouseAreaName = null;
        if (StringUtils.hasText(warehouseAreaId)) {
            WarehouseArea area = warehouseAreaService.getById(warehouseAreaId);
            if (area != null) {
                warehouseAreaName = area.getAreaName();
            }
        }

        ProductSku sku = productSkuService.getOne(
                new LambdaQueryWrapper<ProductSku>().eq(ProductSku::getSkuCode, skuCode));
        if (sku == null) {
            throw new IllegalArgumentException("SKU不存在: " + skuCode);
        }

        boolean updated = productSkuService.decreaseStockBySkuCode(skuCode, quantity);
        if (!updated) {
            int current = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
            throw new IllegalArgumentException("库存不足: " + skuCode + "，可用:" + current + "件，申请:" + quantity + "件");
        }

        ProductOutstock o = new ProductOutstock();
        LocalDateTime now = LocalDateTime.now();
        StyleInfo styleInfo = sku.getStyleId() != null ? styleInfoService.getById(sku.getStyleId()) : null;
        o.setOutstockNo(buildNo("FO", now));
        o.setStyleId(sku.getStyleId() != null ? String.valueOf(sku.getStyleId()) : null);
        o.setStyleNo(sku.getStyleNo());
        o.setStyleName(styleInfo != null ? styleInfo.getStyleName() : null);
        o.setOutstockQuantity(quantity);
        o.setOutstockType(outstockType);
        o.setSourceType(outstockType);
        o.setWarehouse(warehouseLocation);
        o.setWarehouseAreaId(warehouseAreaId);
        o.setWarehouseAreaName(warehouseAreaName);
        o.setRemark(remark);
        o.setSkuCode(sku.getSkuCode());
        o.setColor(sku.getColor());
        o.setSize(sku.getSize());
        o.setCostPrice(sku.getCostPrice());
        o.setSalesPrice(sku.getSalesPrice());
        o.setCustomerName(customerName);
        o.setCustomerPhone(customerPhone);
        o.setShippingAddress(shippingAddress);
        if (sku.getSalesPrice() != null) {
            o.setTotalAmount(sku.getSalesPrice().multiply(BigDecimal.valueOf(quantity)));
        }
        o.setPaidAmount(BigDecimal.ZERO);
        o.setPaymentStatus("unpaid");
        o.setApprovalStatus("pending");
        o.setOperatorId(UserContext.userId());
        o.setOperatorName(UserContext.username());
        o.setCreatorId(UserContext.userId());
        o.setCreatorName(UserContext.username());
        o.setCreateTime(now);
        o.setUpdateTime(now);
        o.setDeleteFlag(0);
        o.setTenantId(tenantId);
        productOutstockService.save(o);

        log.info("[成品出库] skuCode={} -{} 类型={}", skuCode, quantity, outstockType);
        return o;
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductWarehousing scanInbound(String scanCode, int quantity, String warehouseLocation,
                                           String warehouseAreaId, String sourceType, String remark) {
        String skuCode = resolveSkuCodeFromScan(scanCode);
        Map<String, Object> params = new HashMap<>();
        params.put("skuCode", skuCode);
        params.put("quantity", quantity);
        params.put("warehouseLocation", warehouseLocation != null ? warehouseLocation : "默认仓");
        params.put("warehouseAreaId", warehouseAreaId);
        params.put("sourceType", sourceType != null ? sourceType : "scan_inbound");
        params.put("remark", remark);
        return freeInbound(params);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductOutstock scanOutbound(String scanCode, int quantity, String outstockType, String remark) {
        String skuCode = resolveSkuCodeFromScan(scanCode);
        Map<String, Object> params = new HashMap<>();
        params.put("skuCode", skuCode);
        params.put("quantity", quantity);
        params.put("outstockType", outstockType != null ? outstockType : "scan_outbound");
        params.put("remark", remark);
        return freeOutbound(params);
    }

    public Map<String, Object> scanQuery(String scanCode) {
        Long tenantId = UserContext.tenantId();
        String skuCode = resolveSkuCodeFromScan(scanCode);
        ProductSku sku = productSkuService.getOne(
                new LambdaQueryWrapper<ProductSku>().eq(ProductSku::getSkuCode, skuCode));

        if (sku == null) {
            String[] parts = skuCode.split("-", 3);
            String suggestedStyleNo = parts.length >= 1 ? parts[0] : skuCode;
            String suggestedColor = parts.length >= 2 ? parts[1] : "";
            String suggestedSize = parts.length >= 3 ? parts[2] : "";

            StyleInfo style = styleInfoService.getOne(
                    new LambdaQueryWrapper<StyleInfo>()
                            .eq(StyleInfo::getStyleNo, suggestedStyleNo)
                            .eq(StyleInfo::getTenantId, tenantId)
                            .last("LIMIT 1"));

            Map<String, Object> r = new LinkedHashMap<>();
            r.put("found", false);
            r.put("skuCode", skuCode);
            r.put("message", "SKU不存在，可自动创建");
            r.put("canAutoCreate", true);
            r.put("suggestedStyleNo", suggestedStyleNo);
            r.put("suggestedStyleName", style != null ? style.getStyleName() : "");
            r.put("styleExists", style != null);
            r.put("suggestedColor", suggestedColor);
            r.put("suggestedSize", suggestedSize);
            r.put("suggestedPrice", style != null && style.getPrice() != null ? style.getPrice() : BigDecimal.ZERO);
            return r;
        }

        StyleInfo style = sku.getStyleId() != null ? styleInfoService.getById(sku.getStyleId()) : null;
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("found", true);
        r.put("skuCode", sku.getSkuCode());
        r.put("styleNo", sku.getStyleNo() != null ? sku.getStyleNo() : "");
        r.put("styleName", style != null && style.getStyleName() != null ? style.getStyleName() : "");
        r.put("color", sku.getColor() != null ? sku.getColor() : "");
        r.put("size", sku.getSize() != null ? sku.getSize() : "");
        r.put("stockQuantity", sku.getStockQuantity() != null ? sku.getStockQuantity() : 0);
        r.put("salesPrice", sku.getSalesPrice() != null ? sku.getSalesPrice() : BigDecimal.ZERO);
        r.put("costPrice", sku.getCostPrice() != null ? sku.getCostPrice() : BigDecimal.ZERO);
        r.put("barcode", sku.getBarcode() != null ? sku.getBarcode() : "");
        r.put("inboundCode", generateInboundCode(sku.getSkuCode()));
        return r;
    }

    public String generateInboundCode(String skuCode) {
        LocalDateTime now = LocalDateTime.now();
        String timestamp = now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        String random = Integer.toHexString(ThreadLocalRandom.current().nextInt(0x1000, 0x10000))
                .toUpperCase(Locale.ROOT);
        return "WH-" + skuCode + "-" + timestamp + random;
    }

    String resolveSkuCodeFromScan(String scanCode) {
        if (scanCode == null || scanCode.isBlank()) {
            throw new IllegalArgumentException("扫码内容不能为空");
        }
        if (scanCode.startsWith("WH-")) {
            String rest = scanCode.substring(3);
            int secondDash = rest.indexOf('-', rest.indexOf('-') >= 0 ? rest.indexOf('-') + 1 : 0);
            if (secondDash > 0) {
                String possibleSkuCode = rest.substring(0, secondDash);
                if (possibleSkuCode.split("-", 3).length >= 2) {
                    return possibleSkuCode;
                }
            }
        }
        if (scanCode.startsWith("FI") && scanCode.length() > 16) {
            return scanCode;
        }
        if (scanCode.matches("^\\d{13}$")) {
            ProductSku byBarcode = productSkuService.getOne(
                    new LambdaQueryWrapper<ProductSku>()
                            .eq(ProductSku::getBarcode, scanCode)
                            .last("LIMIT 1"));
            if (byBarcode != null) {
                return byBarcode.getSkuCode();
            }
        }
        String[] parts = scanCode.split("-");
        if (parts.length >= 4) {
            return String.join("-", Arrays.copyOf(parts, parts.length - 1));
        }
        return scanCode;
    }

    private String buildNo(String prefix, LocalDateTime now) {
        return prefix + now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                + Integer.toHexString(ThreadLocalRandom.current().nextInt(0x1000, 0x10000))
                .toUpperCase(Locale.ROOT);
    }

    private String trimToNull(Object value) {
        if (value == null) return null;
        String text = String.valueOf(value).trim();
        return StringUtils.hasText(text) ? text : null;
    }

    private Integer toInt(Object value) {
        if (value == null) return null;
        if (value instanceof Number) return ((Number) value).intValue();
        try { return Integer.parseInt(String.valueOf(value).trim()); }
        catch (NumberFormatException e) { return null; }
    }

    private BigDecimal toBigDecimal(Object value) {
        if (value == null) return null;
        if (value instanceof BigDecimal) return (BigDecimal) value;
        if (value instanceof Number) return BigDecimal.valueOf(((Number) value).doubleValue());
        try { return new BigDecimal(String.valueOf(value).trim()); }
        catch (NumberFormatException e) { return null; }
    }
}
