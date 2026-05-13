package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import com.fashion.supplychain.warehouse.entity.StockChangeLog;
import com.fashion.supplychain.warehouse.entity.WarehouseArea;
import com.fashion.supplychain.warehouse.service.StockChangeLogService;
import com.fashion.supplychain.warehouse.service.WarehouseAreaService;
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
public class FinishedWarehouseOperationOrchestrator {

    private final ProductSkuService productSkuService;
    private final ProductWarehousingMapper productWarehousingMapper;
    private final ProductOutstockService productOutstockService;
    private final StyleInfoService styleInfoService;
    private final WarehouseAreaService warehouseAreaService;
    private final StockChangeLogService stockChangeLogService;
    private final ObjectMapper objectMapper;

    private static final Set<String> VALID_SOURCE_TYPES = Set.of(
            "external_purchase", "free_inbound", "transfer_in", "return_in", "other_in", "scan_inbound");

    private static final Set<String> VALID_OUTSTOCK_TYPES = Set.of(
            "free_outbound", "sample_out", "damage_out", "transfer_out", "other_out", "scan_outbound");

    private static final Set<String> EDITABLE_FIELDS = Set.of(
            "warehouse", "warehouseAreaId", "warehouseAreaName", "remark", "unitPrice");

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
        String supplierId = trimToNull(params.get("supplierId"));
        BigDecimal unitPrice = toBigDecimal(params.get("unitPrice"));
        Boolean autoCreateSku = params.get("autoCreateSku") != null
                && Boolean.parseBoolean(String.valueOf(params.get("autoCreateSku")));
        String styleNo = trimToNull(params.get("styleNo"));
        String styleName = trimToNull(params.get("styleName"));
        String color = trimToNull(params.get("color"));
        String size = trimToNull(params.get("size"));
        String warehouseAreaId = trimToNull(params.get("warehouseAreaId"));
        String batchNo = trimToNull(params.get("batchNo"));
        String traceId = trimToNull(params.get("traceId"));

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

        String warehouseAreaName = resolveWarehouseAreaName(warehouseAreaId);

        ProductSku sku = productSkuService.getOne(
                new LambdaQueryWrapper<ProductSku>()
                        .eq(ProductSku::getSkuCode, skuCode)
                        .eq(ProductSku::getTenantId, tenantId));

        if (sku == null) {
            if (!autoCreateSku) {
                throw new IllegalArgumentException("SKU不存在: " + skuCode
                        + "。如需自动创建，请传入 autoCreateSku=true 并提供 styleNo/color/size");
            }
            sku = autoCreateSkuAndStyle(skuCode, styleNo, styleName, color, size, unitPrice, tenantId);
        }

        int beforeQty = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
        productSkuService.updateStock(skuCode, quantity);
        int afterQty = beforeQty + quantity;

        BigDecimal effectivePrice = unitPrice != null ? unitPrice : sku.getCostPrice();
        BigDecimal totalAmount = effectivePrice != null ? effectivePrice.multiply(BigDecimal.valueOf(quantity)) : null;

        String qrcode = generateInboundCode(skuCode);
        if (!StringUtils.hasText(traceId)) {
            traceId = "TR-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();
        }

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
        w.setSupplierId(supplierId);
        w.setUnitPrice(effectivePrice);
        w.setTotalAmount(totalAmount);
        w.setPaymentStatus("unpaid");
        w.setPaidAmount(BigDecimal.ZERO);
        w.setBatchNo(batchNo);
        w.setTraceId(traceId);
        w.setQrcode(qrcode);
        w.setReversalStatus("NONE");
        w.setCreateTime(now);
        w.setUpdateTime(now);
        w.setDeleteFlag(0);
        w.setTenantId(tenantId);
        productWarehousingMapper.insert(w);

        logStockChange("INBOUND", sku, beforeQty, quantity, afterQty, w.getWarehousingNo(),
                sourceType, effectivePrice, totalAmount, traceId, userId, username, tenantId);

        log.info("[成品入库] skuCode={} +{} 来源={} 金额={} traceId={}", skuCode, quantity, sourceType, totalAmount, traceId);
        return w;
    }

    @Transactional(rollbackFor = Exception.class)
    public List<ProductWarehousing> batchInbound(Map<String, Object> body) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        String warehouseLocation = trimToNull(body.get("warehouseLocation"));
        String warehouseAreaId = trimToNull(body.get("warehouseAreaId"));
        String sourceType = trimToNull(body.get("sourceType"));
        if (!StringUtils.hasText(sourceType)) sourceType = "free_inbound";
        if (!StringUtils.hasText(warehouseLocation)) warehouseLocation = "默认仓";

        String batchNo = buildNo("BN", LocalDateTime.now());
        String traceId = "TR-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();

        Object itemsRaw = body.get("items");
        if (!(itemsRaw instanceof List)) {
            throw new IllegalArgumentException("入库明细不能为空");
        }

        List<?> rawList = (List<?>) itemsRaw;
        if (rawList.isEmpty()) {
            throw new IllegalArgumentException("入库明细不能为空");
        }

        List<ProductWarehousing> results = new ArrayList<>();
        for (Object obj : rawList) {
            if (!(obj instanceof Map)) continue;
            Map<String, Object> item = new HashMap<>((Map<String, Object>) obj);
            item.putIfAbsent("warehouseLocation", warehouseLocation);
            item.putIfAbsent("warehouseAreaId", warehouseAreaId);
            item.putIfAbsent("sourceType", sourceType);
            item.putIfAbsent("batchNo", batchNo);
            item.putIfAbsent("traceId", traceId);
            results.add(freeInbound(item));
        }

        log.info("[批量成品入库] batchNo={} count={} traceId={}", batchNo, results.size(), traceId);
        return results;
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductWarehousing reverse(String warehousingId, String reason) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        String username = UserContext.username();

        if (!StringUtils.hasText(warehousingId)) {
            throw new IllegalArgumentException("入库记录ID不能为空");
        }
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("冲销原因不能为空");
        }

        ProductWarehousing original = productWarehousingMapper.selectById(warehousingId);
        if (original == null || (original.getDeleteFlag() != null && original.getDeleteFlag() != 0)) {
            throw new IllegalArgumentException("入库记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(original.getTenantId(), "入库记录");

        if ("REVERSED".equals(original.getReversalStatus())) {
            throw new IllegalArgumentException("该记录已被冲销，不能重复操作");
        }

        String skuCode = original.getSkuCode();
        if (!StringUtils.hasText(skuCode)) {
            throw new IllegalArgumentException("原入库记录缺少SKU编码，无法冲销");
        }

        int reverseQty = original.getQualifiedQuantity() != null ? original.getQualifiedQuantity() : 0;
        if (reverseQty <= 0) {
            throw new IllegalArgumentException("原入库记录合格数量为0，无需冲销");
        }

        ProductSku sku = productSkuService.getOne(
                new LambdaQueryWrapper<ProductSku>()
                        .eq(ProductSku::getSkuCode, skuCode)
                        .eq(ProductSku::getTenantId, tenantId));
        if (sku == null) {
            throw new IllegalArgumentException("SKU不存在: " + skuCode);
        }

        int currentStock = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
        if (currentStock < reverseQty) {
            throw new IllegalArgumentException(String.format(
                    "库存不足无法冲销！当前库存=%d，需冲销=%d。请先做出库调整再冲销。",
                    currentStock, reverseQty));
        }

        boolean updated = productSkuService.decreaseStockBySkuCode(skuCode, reverseQty);
        if (!updated) {
            throw new IllegalArgumentException("库存扣减失败，请重试");
        }

        int afterQty = currentStock - reverseQty;

        original.setReversalStatus("REVERSED");
        original.setUpdateTime(LocalDateTime.now());
        productWarehousingMapper.updateById(original);

        String traceId = original.getTraceId() != null ? original.getTraceId()
                : "TR-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();

        LocalDateTime now = LocalDateTime.now();
        ProductWarehousing reversal = new ProductWarehousing();
        reversal.setId(UUID.randomUUID().toString().replace("-", ""));
        reversal.setWarehousingNo(buildNo("RV", now));
        reversal.setOrderId(original.getOrderId());
        reversal.setOrderNo(original.getOrderNo());
        reversal.setStyleId(original.getStyleId());
        reversal.setStyleNo(original.getStyleNo());
        reversal.setStyleName(original.getStyleName());
        reversal.setWarehousingQuantity(reverseQty);
        reversal.setQualifiedQuantity(0);
        reversal.setUnqualifiedQuantity(0);
        reversal.setWarehousingType("reversal");
        reversal.setWarehouse(original.getWarehouse());
        reversal.setWarehouseAreaId(original.getWarehouseAreaId());
        reversal.setWarehouseAreaName(original.getWarehouseAreaName());
        reversal.setQualityStatus("reversed");
        reversal.setWarehousingOperatorId(userId);
        reversal.setWarehousingOperatorName(username);
        reversal.setWarehousingEndTime(now);
        reversal.setSkuCode(skuCode);
        reversal.setColor(original.getColor());
        reversal.setSize(original.getSize());
        reversal.setDefectRemark(reason);
        reversal.setUnitPrice(original.getUnitPrice());
        reversal.setTotalAmount(original.getTotalAmount() != null ? original.getTotalAmount().negate() : null);
        reversal.setPaymentStatus("reversed");
        reversal.setPaidAmount(BigDecimal.ZERO);
        reversal.setReversalId(original.getId());
        reversal.setReversalStatus("NONE");
        reversal.setReversalReason(reason);
        reversal.setTraceId(traceId);
        reversal.setBatchNo(original.getBatchNo());
        reversal.setCreateTime(now);
        reversal.setUpdateTime(now);
        reversal.setDeleteFlag(0);
        reversal.setTenantId(tenantId);
        productWarehousingMapper.insert(reversal);

        original.setReversedById(reversal.getId());
        original.setUpdateTime(LocalDateTime.now());
        productWarehousingMapper.updateById(original);

        logStockChange("REVERSAL", sku, currentStock, -reverseQty, afterQty,
                reversal.getWarehousingNo(), "reversal",
                original.getUnitPrice(), reversal.getTotalAmount(), traceId, userId, username, tenantId);

        log.info("[成品冲销] originalId={} reversalId={} skuCode={} -{} reason={}",
                original.getId(), reversal.getId(), skuCode, reverseQty, reason);
        return reversal;
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductWarehousing edit(String warehousingId, Map<String, Object> changes) {
        TenantAssert.assertTenantContext();

        if (!StringUtils.hasText(warehousingId)) {
            throw new IllegalArgumentException("入库记录ID不能为空");
        }
        if (changes == null || changes.isEmpty()) {
            throw new IllegalArgumentException("修改内容不能为空");
        }

        ProductWarehousing current = productWarehousingMapper.selectById(warehousingId);
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new IllegalArgumentException("入库记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "入库记录");

        if ("REVERSED".equals(current.getReversalStatus())) {
            throw new IllegalArgumentException("已冲销记录不能编辑");
        }

        Map<String, Object> editSnapshot = new LinkedHashMap<>();
        editSnapshot.put("editTime", LocalDateTime.now().toString());
        editSnapshot.put("editUserId", UserContext.userId());
        editSnapshot.put("editUsername", UserContext.username());
        Map<String, Object> fieldChanges = new LinkedHashMap<>();

        if (changes.containsKey("warehouse")) {
            fieldChanges.put("warehouse", buildChangeMap(current.getWarehouse(), changes.get("warehouse")));
            current.setWarehouse(trimToNull(changes.get("warehouse")));
        }
        if (changes.containsKey("warehouseAreaId")) {
            String newAreaId = trimToNull(changes.get("warehouseAreaId"));
            fieldChanges.put("warehouseAreaId", buildChangeMap(current.getWarehouseAreaId(), newAreaId));
            current.setWarehouseAreaId(newAreaId);
            current.setWarehouseAreaName(resolveWarehouseAreaName(newAreaId));
        }
        if (changes.containsKey("remark")) {
            fieldChanges.put("remark", buildChangeMap(current.getDefectRemark(), changes.get("remark")));
            current.setDefectRemark(trimToNull(changes.get("remark")));
        }
        if (changes.containsKey("unitPrice")) {
            BigDecimal newPrice = toBigDecimal(changes.get("unitPrice"));
            fieldChanges.put("unitPrice", buildChangeMap(current.getUnitPrice(), newPrice));
            current.setUnitPrice(newPrice);
            if (newPrice != null && current.getQualifiedQuantity() != null) {
                BigDecimal newTotal = newPrice.multiply(BigDecimal.valueOf(current.getQualifiedQuantity()));
                fieldChanges.put("totalAmount", buildChangeMap(current.getTotalAmount(), newTotal));
                current.setTotalAmount(newTotal);
            }
        }

        if (fieldChanges.isEmpty()) {
            throw new IllegalArgumentException("没有有效的修改字段");
        }

        editSnapshot.put("changes", fieldChanges);

        try {
            String existingHistory = current.getEditHistory();
            List<Map<String, Object>> historyList = new ArrayList<>();
            if (StringUtils.hasText(existingHistory)) {
                historyList = objectMapper.readValue(existingHistory, List.class);
            }
            historyList.add(editSnapshot);
            current.setEditHistory(objectMapper.writeValueAsString(historyList));
        } catch (Exception e) {
            log.warn("[成品入库编辑] 编辑历史序列化失败，跳过历史记录: {}", e.getMessage());
        }

        current.setUpdateTime(LocalDateTime.now());
        productWarehousingMapper.updateById(current);

        log.info("[成品入库编辑] id={} fields={}", warehousingId, fieldChanges.keySet());
        return current;
    }

    public List<Map<String, Object>> getEditHistory(String warehousingId) {
        ProductWarehousing w = productWarehousingMapper.selectById(warehousingId);
        if (w == null || !StringUtils.hasText(w.getEditHistory())) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(w.getEditHistory(), List.class);
        } catch (Exception e) {
            log.warn("[编辑历史] 解析失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    public Map<String, Object> getAmountTrace(String traceId) {
        if (!StringUtils.hasText(traceId)) {
            return Collections.emptyMap();
        }
        Long tenantId = UserContext.tenantId();

        List<ProductWarehousing> warehousingList = productWarehousingMapper.selectList(
                new LambdaQueryWrapper<ProductWarehousing>()
                        .eq(ProductWarehousing::getTraceId, traceId)
                        .eq(ProductWarehousing::getTenantId, tenantId)
                        .eq(ProductWarehousing::getDeleteFlag, 0)
                        .orderByAsc(ProductWarehousing::getCreateTime));

        List<StockChangeLog> stockLogs = stockChangeLogService.list(
                new LambdaQueryWrapper<StockChangeLog>()
                        .eq(StockChangeLog::getTraceId, traceId)
                        .eq(StockChangeLog::getTenantId, tenantId)
                        .orderByAsc(StockChangeLog::getCreateTime));

        BigDecimal totalInbound = BigDecimal.ZERO;
        BigDecimal totalReversal = BigDecimal.ZERO;
        for (ProductWarehousing w : warehousingList) {
            if ("reversal".equals(w.getWarehousingType())) {
                totalReversal = totalReversal.add(w.getTotalAmount() != null ? w.getTotalAmount().abs() : BigDecimal.ZERO);
            } else {
                totalInbound = totalInbound.add(w.getTotalAmount() != null ? w.getTotalAmount() : BigDecimal.ZERO);
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("traceId", traceId);
        result.put("warehousingRecords", warehousingList);
        result.put("stockChangeLogs", stockLogs);
        result.put("totalInboundAmount", totalInbound);
        result.put("totalReversalAmount", totalReversal);
        result.put("netAmount", totalInbound.subtract(totalReversal));
        result.put("recordCount", warehousingList.size());
        return result;
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
        String traceId = trimToNull(params.get("traceId"));

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

        String warehouseAreaName = resolveWarehouseAreaName(warehouseAreaId);

        ProductSku sku = productSkuService.getOne(
                new LambdaQueryWrapper<ProductSku>()
                        .eq(ProductSku::getSkuCode, skuCode)
                        .eq(ProductSku::getTenantId, tenantId));
        if (sku == null) {
            throw new IllegalArgumentException("SKU不存在: " + skuCode);
        }

        int beforeQty = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
        boolean updated = productSkuService.decreaseStockBySkuCode(skuCode, quantity);
        if (!updated) {
            int current = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
            throw new IllegalArgumentException("库存不足: " + skuCode + "，可用:" + current + "件，申请:" + quantity + "件");
        }
        int afterQty = beforeQty - quantity;

        if (!StringUtils.hasText(traceId)) {
            traceId = "TR-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();
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

        logStockChange("OUTSTOCK", sku, beforeQty, -quantity, afterQty, o.getOutstockNo(),
                outstockType, sku.getSalesPrice(), o.getTotalAmount(), traceId,
                UserContext.userId(), UserContext.username(), tenantId);

        log.info("[成品出库] skuCode={} -{} 类型={} traceId={}", skuCode, quantity, outstockType, traceId);
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
                new LambdaQueryWrapper<ProductSku>()
                        .eq(ProductSku::getSkuCode, skuCode)
                        .eq(ProductSku::getTenantId, tenantId));

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
            Long tenantId = UserContext.tenantId();
            ProductSku byBarcode = productSkuService.getOne(
                    new LambdaQueryWrapper<ProductSku>()
                            .eq(ProductSku::getBarcode, scanCode)
                            .eq(ProductSku::getTenantId, tenantId)
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

    private void logStockChange(String changeType, ProductSku sku, int beforeQty, int delta, int afterQty,
                                 String bizNo, String bizType, BigDecimal unitPrice, BigDecimal totalAmount,
                                 String traceId, String operatorId, String operatorName, Long tenantId) {
        try {
            StockChangeLog scl = new StockChangeLog();
            scl.setId(UUID.randomUUID().toString().replace("-", ""));
            scl.setChangeNo(buildNo("SC", LocalDateTime.now()));
            scl.setChangeType(changeType);
            scl.setStockType("FINISHED");
            scl.setStyleNo(sku.getStyleNo());
            scl.setColor(sku.getColor());
            scl.setSize(sku.getSize());
            scl.setBeforeQuantity(BigDecimal.valueOf(beforeQty));
            scl.setChangeQuantity(BigDecimal.valueOf(delta));
            scl.setAfterQuantity(BigDecimal.valueOf(afterQty));
            scl.setBizType(bizType);
            scl.setBizNo(bizNo);
            scl.setUnitPrice(unitPrice);
            scl.setTotalAmount(totalAmount);
            scl.setTraceId(traceId);
            scl.setOperatorId(operatorId);
            scl.setOperatorName(operatorName);
            scl.setTenantId(tenantId);
            scl.setCreateTime(LocalDateTime.now());
            stockChangeLogService.save(scl);
        } catch (Exception e) {
            log.warn("[StockChangeLog] 保存库存变动日志失败: {}", e.getMessage());
        }
    }

    private Map<String, Object> buildChangeMap(Object oldValue, Object newValue) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("old", oldValue);
        map.put("new", newValue);
        return map;
    }

    private String resolveWarehouseAreaName(String warehouseAreaId) {
        if (!StringUtils.hasText(warehouseAreaId)) return null;
        try {
            WarehouseArea area = warehouseAreaService.getById(warehouseAreaId);
            return area != null ? area.getAreaName() : null;
        } catch (Exception e) {
            return null;
        }
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
