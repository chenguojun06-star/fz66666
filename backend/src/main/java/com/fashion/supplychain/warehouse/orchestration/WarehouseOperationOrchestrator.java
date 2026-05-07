package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.mapper.MaterialInboundMapper;
import com.fashion.supplychain.production.mapper.MaterialOutboundLogMapper;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.warehouse.helper.FinishedOutstockHelper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

@Service
@Slf4j
@RequiredArgsConstructor
public class WarehouseOperationOrchestrator {

    private final ProductSkuService productSkuService;
    private final ProductWarehousingMapper productWarehousingMapper;
    private final ProductOutstockService productOutstockService;
    private final StyleInfoService styleInfoService;
    private final MaterialStockService materialStockService;
    private final MaterialOutboundLogMapper materialOutboundLogMapper;
    private final MaterialInboundMapper materialInboundMapper;
    private final FinishedOutstockHelper finishedOutstockHelper;

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

        Set<String> validSourceTypes = Set.of(
                "external_purchase", "free_inbound", "transfer_in", "return_in", "other_in");
        if (!validSourceTypes.contains(sourceType)) {
            throw new IllegalArgumentException("不支持的入库来源类型: " + sourceType
                    + "，可选: " + String.join("/", validSourceTypes));
        }

        ProductSku sku = productSkuService.getOne(
                new LambdaQueryWrapper<ProductSku>().eq(ProductSku::getSkuCode, skuCode));
        if (sku == null) {
            throw new IllegalArgumentException("SKU不存在: " + skuCode);
        }

        productSkuService.updateStock(skuCode, quantity);
        log.info("[成品自由入库] skuCode={} +{} 来源={}", skuCode, quantity, sourceType);

        ProductWarehousing warehousing = new ProductWarehousing();
        LocalDateTime now = LocalDateTime.now();
        warehousing.setId(UUID.randomUUID().toString().replace("-", ""));
        warehousing.setWarehousingNo(buildInboundNo("FI", now));
        warehousing.setOrderId(null);
        warehousing.setOrderNo(null);
        warehousing.setStyleId(sku.getStyleId() != null ? String.valueOf(sku.getStyleId()) : null);
        warehousing.setStyleNo(sku.getStyleNo());
        StyleInfo style = sku.getStyleId() != null ? styleInfoService.getById(sku.getStyleId()) : null;
        warehousing.setStyleName(style != null ? style.getStyleName() : null);
        warehousing.setWarehousingQuantity(quantity);
        warehousing.setQualifiedQuantity(quantity);
        warehousing.setUnqualifiedQuantity(0);
        warehousing.setWarehousingType(sourceType);
        warehousing.setWarehouse(warehouseLocation);
        warehousing.setQualityStatus("qualified");
        warehousing.setWarehousingOperatorId(userId);
        warehousing.setWarehousingOperatorName(username);
        warehousing.setWarehousingEndTime(now);
        warehousing.setSkuCode(skuCode);
        warehousing.setColor(sku.getColor());
        warehousing.setSize(sku.getSize());
        warehousing.setDefectRemark(remark);
        warehousing.setFactoryName(supplierName);
        warehousing.setCreateTime(now);
        warehousing.setUpdateTime(now);
        warehousing.setDeleteFlag(0);
        warehousing.setTenantId(tenantId);
        productWarehousingMapper.insert(warehousing);

        return warehousing;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> scanInbound(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        String scanCode = trimToNull(params.get("scanCode"));
        String warehouseType = trimToNull(params.get("warehouseType"));
        Integer quantity = toInt(params.get("quantity"));
        String warehouseLocation = trimToNull(params.get("warehouseLocation"));
        String sourceType = trimToNull(params.get("sourceType"));
        String remark = trimToNull(params.get("remark"));

        if (!StringUtils.hasText(scanCode)) {
            throw new IllegalArgumentException("扫码内容不能为空");
        }
        if (quantity == null || quantity <= 0) {
            quantity = 1;
        }
        if (!StringUtils.hasText(warehouseType)) {
            warehouseType = "finished";
        }
        if (!StringUtils.hasText(warehouseLocation)) {
            warehouseLocation = "默认仓";
        }
        if (!StringUtils.hasText(sourceType)) {
            sourceType = "scan_inbound";
        }

        if ("finished".equals(warehouseType)) {
            return scanFinishedInbound(scanCode, quantity, warehouseLocation, sourceType, remark);
        } else if ("material".equals(warehouseType)) {
            return scanMaterialInbound(scanCode, quantity, warehouseLocation, sourceType, remark);
        } else {
            throw new IllegalArgumentException("不支持的仓库类型: " + warehouseType);
        }
    }

    private Map<String, Object> scanFinishedInbound(String scanCode, int quantity,
                                                     String warehouseLocation, String sourceType, String remark) {
        String skuCode = resolveSkuCodeFromScan(scanCode);
        ProductSku sku = productSkuService.getOne(
                new LambdaQueryWrapper<ProductSku>().eq(ProductSku::getSkuCode, skuCode));
        if (sku == null) {
            throw new IllegalArgumentException("SKU不存在: " + skuCode + "（扫码内容: " + scanCode + "）");
        }

        Map<String, Object> inboundParams = new HashMap<>();
        inboundParams.put("skuCode", skuCode);
        inboundParams.put("quantity", quantity);
        inboundParams.put("warehouseLocation", warehouseLocation);
        inboundParams.put("sourceType", sourceType);
        inboundParams.put("remark", remark);
        ProductWarehousing result = freeInbound(inboundParams);

        return Map.of(
                "id", result.getId(),
                "warehousingNo", result.getWarehousingNo(),
                "skuCode", skuCode,
                "styleNo", sku.getStyleNo() != null ? sku.getStyleNo() : "",
                "color", sku.getColor() != null ? sku.getColor() : "",
                "size", sku.getSize() != null ? sku.getSize() : "",
                "quantity", quantity,
                "warehouseLocation", warehouseLocation
        );
    }

    private Map<String, Object> scanMaterialInbound(String scanCode, int quantity,
                                                     String warehouseLocation, String sourceType, String remark) {
        MaterialStock stock = materialStockService.getOne(
                new LambdaQueryWrapper<MaterialStock>()
                        .eq(MaterialStock::getMaterialCode, scanCode)
                        .eq(MaterialStock::getDeleteFlag, 0)
                        .last("LIMIT 1"));
        if (stock == null) {
            throw new IllegalArgumentException("物料不存在: " + scanCode);
        }

        materialStockService.updateStockQuantity(stock.getId(), quantity);
        log.info("[物料扫码入库] materialCode={} +{} 仓位={}", scanCode, quantity, warehouseLocation);

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("stockId", stock.getId());
        r.put("materialCode", stock.getMaterialCode());
        r.put("materialName", stock.getMaterialName() != null ? stock.getMaterialName() : "");
        r.put("quantity", quantity);
        r.put("warehouseLocation", warehouseLocation);
        return r;
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

        if (!StringUtils.hasText(skuCode)) {
            throw new IllegalArgumentException("SKU编码不能为空");
        }
        if (quantity == null || quantity <= 0) {
            throw new IllegalArgumentException("出库数量必须大于0");
        }
        if (!StringUtils.hasText(outstockType)) {
            outstockType = "free_outbound";
        }

        Set<String> validOutstockTypes = Set.of(
                "free_outbound", "sample_out", "damage_out", "transfer_out", "other_out");
        if (!validOutstockTypes.contains(outstockType)) {
            throw new IllegalArgumentException("不支持的出库类型: " + outstockType
                    + "，可选: " + String.join("/", validOutstockTypes));
        }

        ProductSku sku = productSkuService.getOne(
                new LambdaQueryWrapper<ProductSku>().eq(ProductSku::getSkuCode, skuCode));
        if (sku == null) {
            throw new IllegalArgumentException("SKU不存在: " + skuCode);
        }

        boolean updated = productSkuService.decreaseStockBySkuCode(skuCode, quantity);
        if (!updated) {
            int current = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
            throw new IllegalArgumentException(
                    "库存不足: " + skuCode + "，可用库存:" + current + "件，申请出库:" + quantity + "件");
        }

        ProductOutstock outstock = new ProductOutstock();
        LocalDateTime now = LocalDateTime.now();
        StyleInfo styleInfo = sku.getStyleId() != null ? styleInfoService.getById(sku.getStyleId()) : null;
        outstock.setOutstockNo(buildOutstockNo(now));
        outstock.setStyleId(sku.getStyleId() != null ? String.valueOf(sku.getStyleId()) : null);
        outstock.setStyleNo(sku.getStyleNo());
        outstock.setStyleName(styleInfo != null ? styleInfo.getStyleName() : null);
        outstock.setOutstockQuantity(quantity);
        outstock.setOutstockType(outstockType);
        outstock.setWarehouse(warehouseLocation);
        outstock.setRemark(remark);
        outstock.setSkuCode(sku.getSkuCode());
        outstock.setColor(sku.getColor());
        outstock.setSize(sku.getSize());
        outstock.setCostPrice(sku.getCostPrice());
        outstock.setSalesPrice(sku.getSalesPrice());
        outstock.setCustomerName(customerName);
        outstock.setCustomerPhone(customerPhone);
        outstock.setShippingAddress(shippingAddress);
        if (sku.getSalesPrice() != null) {
            outstock.setTotalAmount(sku.getSalesPrice().multiply(BigDecimal.valueOf(quantity)));
        }
        outstock.setPaidAmount(BigDecimal.ZERO);
        outstock.setPaymentStatus("unpaid");
        outstock.setApprovalStatus("pending");
        outstock.setOperatorId(UserContext.userId());
        outstock.setOperatorName(UserContext.username());
        outstock.setCreatorId(UserContext.userId());
        outstock.setCreatorName(UserContext.username());
        outstock.setCreateTime(now);
        outstock.setUpdateTime(now);
        outstock.setDeleteFlag(0);
        outstock.setTenantId(tenantId);
        productOutstockService.save(outstock);

        log.info("[成品自由出库] skuCode={} -{} 类型={}", skuCode, quantity, outstockType);
        return outstock;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> scanOutbound(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        String scanCode = trimToNull(params.get("scanCode"));
        String warehouseType = trimToNull(params.get("warehouseType"));
        Integer quantity = toInt(params.get("quantity"));
        String outstockType = trimToNull(params.get("outstockType"));
        String remark = trimToNull(params.get("remark"));

        if (!StringUtils.hasText(scanCode)) {
            throw new IllegalArgumentException("扫码内容不能为空");
        }
        if (quantity == null || quantity <= 0) {
            quantity = 1;
        }
        if (!StringUtils.hasText(warehouseType)) {
            warehouseType = "finished";
        }
        if (!StringUtils.hasText(outstockType)) {
            outstockType = "scan_outbound";
        }

        if ("finished".equals(warehouseType)) {
            return scanFinishedOutbound(scanCode, quantity, outstockType, remark);
        } else if ("material".equals(warehouseType)) {
            return scanMaterialOutbound(scanCode, quantity, outstockType, remark);
        } else {
            throw new IllegalArgumentException("不支持的仓库类型: " + warehouseType);
        }
    }

    private Map<String, Object> scanFinishedOutbound(String scanCode, int quantity,
                                                      String outstockType, String remark) {
        String skuCode = resolveSkuCodeFromScan(scanCode);
        ProductSku sku = productSkuService.getOne(
                new LambdaQueryWrapper<ProductSku>().eq(ProductSku::getSkuCode, skuCode));
        if (sku == null) {
            throw new IllegalArgumentException("SKU不存在: " + skuCode);
        }

        Map<String, Object> outboundParams = new HashMap<>();
        outboundParams.put("skuCode", skuCode);
        outboundParams.put("quantity", quantity);
        outboundParams.put("outstockType", outstockType);
        outboundParams.put("remark", remark);
        ProductOutstock result = freeOutbound(outboundParams);

        return Map.of(
                "id", result.getId(),
                "outstockNo", result.getOutstockNo(),
                "skuCode", skuCode,
                "styleNo", sku.getStyleNo() != null ? sku.getStyleNo() : "",
                "color", sku.getColor() != null ? sku.getColor() : "",
                "size", sku.getSize() != null ? sku.getSize() : "",
                "quantity", quantity
        );
    }

    private Map<String, Object> scanMaterialOutbound(String scanCode, int quantity,
                                                      String outstockType, String remark) {
        MaterialStock stock = materialStockService.getOne(
                new LambdaQueryWrapper<MaterialStock>()
                        .eq(MaterialStock::getMaterialCode, scanCode)
                        .eq(MaterialStock::getDeleteFlag, 0)
                        .last("LIMIT 1"));
        if (stock == null) {
            throw new IllegalArgumentException("物料不存在: " + scanCode);
        }

        materialStockService.decreaseStockById(stock.getId(), quantity);
        MaterialOutboundLog outboundLog = new MaterialOutboundLog();
        LocalDateTime now = LocalDateTime.now();
        outboundLog.setId(UUID.randomUUID().toString().replace("-", ""));
        outboundLog.setOutboundNo(buildInboundNo("MOB", now));
        outboundLog.setSourceType(outstockType);
        outboundLog.setStockId(stock.getId());
        outboundLog.setMaterialCode(stock.getMaterialCode());
        outboundLog.setMaterialName(stock.getMaterialName());
        outboundLog.setQuantity(quantity);
        outboundLog.setOperatorId(UserContext.userId());
        outboundLog.setOperatorName(UserContext.username());
        outboundLog.setWarehouseLocation(stock.getLocation());
        outboundLog.setRemark(remark);
        outboundLog.setOutboundTime(now);
        outboundLog.setCreateTime(now);
        outboundLog.setDeleteFlag(0);
        outboundLog.setTenantId(UserContext.tenantId());
        materialOutboundLogMapper.insert(outboundLog);

        log.info("[物料扫码出库] materialCode={} -{} 类型={}", scanCode, quantity, outstockType);
        return Map.of(
                "id", outboundLog.getId(),
                "outstockNo", outboundLog.getOutboundNo(),
                "materialCode", stock.getMaterialCode(),
                "materialName", stock.getMaterialName() != null ? stock.getMaterialName() : "",
                "quantity", quantity
        );
    }

    public Map<String, Object> scanQuery(String scanCode, String warehouseType) {
        if (!StringUtils.hasText(scanCode)) {
            throw new IllegalArgumentException("扫码内容不能为空");
        }
        if (!StringUtils.hasText(warehouseType)) {
            warehouseType = "finished";
        }

        if ("finished".equals(warehouseType)) {
            return queryFinishedByScan(scanCode);
        } else if ("material".equals(warehouseType)) {
            return queryMaterialByScan(scanCode);
        }
        throw new IllegalArgumentException("不支持的仓库类型: " + warehouseType);
    }

    private Map<String, Object> queryFinishedByScan(String scanCode) {
        String skuCode = resolveSkuCodeFromScan(scanCode);
        ProductSku sku = productSkuService.getOne(
                new LambdaQueryWrapper<ProductSku>().eq(ProductSku::getSkuCode, skuCode));
        if (sku == null) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("found", false);
            r.put("scanCode", scanCode);
            r.put("message", "SKU不存在: " + skuCode);
            return r;
        }
        StyleInfo style = sku.getStyleId() != null ? styleInfoService.getById(sku.getStyleId()) : null;
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("found", true);
        r.put("warehouseType", "finished");
        r.put("skuCode", sku.getSkuCode());
        r.put("styleNo", sku.getStyleNo() != null ? sku.getStyleNo() : "");
        r.put("styleName", style != null && style.getStyleName() != null ? style.getStyleName() : "");
        r.put("color", sku.getColor() != null ? sku.getColor() : "");
        r.put("size", sku.getSize() != null ? sku.getSize() : "");
        r.put("stockQuantity", sku.getStockQuantity() != null ? sku.getStockQuantity() : 0);
        r.put("salesPrice", sku.getSalesPrice() != null ? sku.getSalesPrice() : BigDecimal.ZERO);
        r.put("costPrice", sku.getCostPrice() != null ? sku.getCostPrice() : BigDecimal.ZERO);
        return r;
    }

    private Map<String, Object> queryMaterialByScan(String scanCode) {
        MaterialStock stock = materialStockService.getOne(
                new LambdaQueryWrapper<MaterialStock>()
                        .eq(MaterialStock::getMaterialCode, scanCode)
                        .eq(MaterialStock::getDeleteFlag, 0)
                        .last("LIMIT 1"));
        if (stock == null) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("found", false);
            r.put("scanCode", scanCode);
            r.put("message", "物料不存在: " + scanCode);
            return r;
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("found", true);
        r.put("warehouseType", "material");
        r.put("stockId", stock.getId());
        r.put("materialCode", stock.getMaterialCode());
        r.put("materialName", stock.getMaterialName() != null ? stock.getMaterialName() : "");
        r.put("materialType", stock.getMaterialType() != null ? stock.getMaterialType() : "");
        r.put("color", stock.getColor() != null ? stock.getColor() : "");
        r.put("size", stock.getSize() != null ? stock.getSize() : "");
        r.put("quantity", stock.getQuantity() != null ? stock.getQuantity() : 0);
        r.put("lockedQuantity", stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0);
        r.put("unitPrice", stock.getUnitPrice() != null ? stock.getUnitPrice() : BigDecimal.ZERO);
        r.put("location", stock.getLocation() != null ? stock.getLocation() : "");
        r.put("unit", stock.getUnit() != null ? stock.getUnit() : "");
        return r;
    }

    String resolveSkuCodeFromScan(String scanCode) {
        if (scanCode == null || scanCode.isBlank()) {
            throw new IllegalArgumentException("扫码内容不能为空");
        }
        String[] parts = scanCode.split("-");
        if (parts.length >= 4) {
            return String.join("-", Arrays.copyOf(parts, parts.length - 1));
        }
        return scanCode;
    }

    private String buildInboundNo(String prefix, LocalDateTime now) {
        return prefix + now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                + Integer.toHexString(ThreadLocalRandom.current().nextInt(0x1000, 0x10000))
                .toUpperCase(Locale.ROOT);
    }

    private String buildOutstockNo(LocalDateTime now) {
        return "FO" + now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
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
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private BigDecimal toBigDecimal(Object value) {
        if (value == null) return null;
        if (value instanceof BigDecimal) return (BigDecimal) value;
        if (value instanceof Number) return BigDecimal.valueOf(((Number) value).doubleValue());
        try {
            return new BigDecimal(String.valueOf(value).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
