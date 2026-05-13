package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialInboundMapper;
import com.fashion.supplychain.production.mapper.MaterialOutboundLogMapper;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.warehouse.entity.StockChangeLog;
import com.fashion.supplychain.warehouse.service.StockChangeLogService;
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
public class MaterialWarehouseOperationOrchestrator {

    private final MaterialStockService materialStockService;
    private final MaterialInboundMapper materialInboundMapper;
    private final MaterialOutboundLogMapper materialOutboundLogMapper;
    private final StockChangeLogService stockChangeLogService;
    private final ObjectMapper objectMapper;

    private static final Set<String> VALID_SOURCE_TYPES = Set.of(
            "external_purchase", "free_inbound", "transfer_in", "return_in", "other_in", "scan_inbound");

    private static final Set<String> VALID_OUTSTOCK_TYPES = Set.of(
            "free_outbound", "sample_out", "damage_out", "transfer_out", "other_out", "scan_outbound");

    @Transactional(rollbackFor = Exception.class)
    public MaterialInbound freeInbound(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        String username = UserContext.username();

        String materialCode = trimToNull(params.get("materialCode"));
        Integer quantity = toInt(params.get("quantity"));
        String warehouseLocation = trimToNull(params.get("warehouseLocation"));
        String sourceType = trimToNull(params.get("sourceType"));
        String remark = trimToNull(params.get("remark"));
        String supplierName = trimToNull(params.get("supplierName"));
        BigDecimal unitPrice = toBigDecimal(params.get("unitPrice"));
        String purchaseOrderId = trimToNull(params.get("purchaseOrderId"));
        String batchNo = trimToNull(params.get("batchNo"));
        String traceId = trimToNull(params.get("traceId"));

        if (!StringUtils.hasText(materialCode)) {
            throw new IllegalArgumentException("物料编码不能为空");
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

        MaterialStock stock = materialStockService.getOne(
                new LambdaQueryWrapper<MaterialStock>()
                        .eq(MaterialStock::getMaterialCode, materialCode)
                        .eq(MaterialStock::getTenantId, tenantId)
                        .eq(MaterialStock::getDeleteFlag, 0)
                        .last("LIMIT 1"));
        if (stock == null) {
            Boolean autoCreate = params.get("autoCreateStock") != null
                    && Boolean.parseBoolean(String.valueOf(params.get("autoCreateStock")));
            if (!autoCreate) {
                throw new IllegalArgumentException("物料库存记录不存在: " + materialCode
                        + "。如需自动创建，请传入 autoCreateStock=true 并提供 materialName/color/size");
            }
            stock = autoCreateMaterialStock(materialCode, params, tenantId);
        }

        int beforeQty = stock.getQuantity() != null ? stock.getQuantity() : 0;
        materialStockService.updateStockQuantity(stock.getId(), quantity);
        int afterQty = beforeQty + quantity;

        BigDecimal effectivePrice = unitPrice != null ? unitPrice : stock.getUnitPrice();
        BigDecimal totalAmount = effectivePrice != null ? effectivePrice.multiply(BigDecimal.valueOf(quantity)) : null;

        if (!StringUtils.hasText(traceId)) {
            traceId = "TR-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();
        }

        LocalDateTime now = LocalDateTime.now();
        MaterialInbound inbound = new MaterialInbound();
        inbound.setId(UUID.randomUUID().toString().replace("-", ""));
        inbound.setInboundNo(buildNo("MI", now));
        inbound.setMaterialCode(materialCode);
        inbound.setMaterialName(stock.getMaterialName());
        inbound.setQuantity(quantity);
        inbound.setSourceType(sourceType);
        inbound.setWarehouseLocation(warehouseLocation);
        inbound.setSupplierName(supplierName);
        inbound.setUnitPrice(effectivePrice);
        inbound.setTotalAmount(totalAmount);
        inbound.setPaymentStatus("unpaid");
        inbound.setPaidAmount(BigDecimal.ZERO);
        inbound.setPurchaseOrderId(purchaseOrderId);
        inbound.setBatchNo(batchNo);
        inbound.setTraceId(traceId);
        inbound.setReversalStatus("NONE");
        inbound.setRemark(remark);
        inbound.setOperatorId(userId);
        inbound.setOperatorName(username);
        inbound.setInboundTime(now);
        inbound.setCreateTime(now);
        inbound.setUpdateTime(now);
        inbound.setDeleteFlag(0);
        inbound.setTenantId(tenantId);
        materialInboundMapper.insert(inbound);

        logStockChange("INBOUND", stock, beforeQty, quantity, afterQty,
                inbound.getInboundNo(), sourceType, effectivePrice, totalAmount,
                traceId, userId, username, tenantId);

        log.info("[物料入库] materialCode={} +{} 来源={} 金额={} traceId={}", materialCode, quantity, sourceType, totalAmount, traceId);
        return inbound;
    }

    @Transactional(rollbackFor = Exception.class)
    public List<MaterialInbound> batchInbound(Map<String, Object> body) {
        TenantAssert.assertTenantContext();

        String warehouseLocation = trimToNull(body.get("warehouseLocation"));
        String sourceType = trimToNull(body.get("sourceType"));
        if (!StringUtils.hasText(sourceType)) sourceType = "free_inbound";
        if (!StringUtils.hasText(warehouseLocation)) warehouseLocation = "默认仓";

        String batchNo = buildNo("MBN", LocalDateTime.now());
        String traceId = "TR-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();

        Object itemsRaw = body.get("items");
        if (!(itemsRaw instanceof List)) {
            throw new IllegalArgumentException("入库明细不能为空");
        }
        List<?> rawList = (List<?>) itemsRaw;
        if (rawList.isEmpty()) {
            throw new IllegalArgumentException("入库明细不能为空");
        }

        List<MaterialInbound> results = new ArrayList<>();
        for (Object obj : rawList) {
            if (!(obj instanceof Map)) continue;
            Map<String, Object> item = new HashMap<>((Map<String, Object>) obj);
            item.putIfAbsent("warehouseLocation", warehouseLocation);
            item.putIfAbsent("sourceType", sourceType);
            item.putIfAbsent("batchNo", batchNo);
            item.putIfAbsent("traceId", traceId);
            results.add(freeInbound(item));
        }

        log.info("[批量物料入库] batchNo={} count={} traceId={}", batchNo, results.size(), traceId);
        return results;
    }

    @Transactional(rollbackFor = Exception.class)
    public MaterialInbound reverse(String inboundId, String reason) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        String username = UserContext.username();

        if (!StringUtils.hasText(inboundId)) {
            throw new IllegalArgumentException("入库记录ID不能为空");
        }
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("冲销原因不能为空");
        }

        MaterialInbound original = materialInboundMapper.selectById(inboundId);
        if (original == null || (original.getDeleteFlag() != null && original.getDeleteFlag() != 0)) {
            throw new IllegalArgumentException("入库记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(original.getTenantId(), "物料入库记录");

        if ("REVERSED".equals(original.getReversalStatus())) {
            throw new IllegalArgumentException("该记录已被冲销，不能重复操作");
        }

        String materialCode = original.getMaterialCode();
        int reverseQty = original.getQuantity() != null ? original.getQuantity() : 0;
        if (reverseQty <= 0) {
            throw new IllegalArgumentException("原入库记录数量为0，无需冲销");
        }

        MaterialStock stock = materialStockService.getOne(
                new LambdaQueryWrapper<MaterialStock>()
                        .eq(MaterialStock::getMaterialCode, materialCode)
                        .eq(MaterialStock::getTenantId, tenantId)
                        .eq(MaterialStock::getDeleteFlag, 0)
                        .last("LIMIT 1"));
        if (stock == null) {
            throw new IllegalArgumentException("物料不存在: " + materialCode);
        }

        int currentStock = stock.getQuantity() != null ? stock.getQuantity() : 0;
        if (currentStock < reverseQty) {
            throw new IllegalArgumentException(String.format(
                    "库存不足无法冲销！当前库存=%d，需冲销=%d。", currentStock, reverseQty));
        }

        materialStockService.decreaseStockById(stock.getId(), reverseQty);
        int afterQty = currentStock - reverseQty;

        original.setReversalStatus("REVERSED");
        original.setUpdateTime(LocalDateTime.now());
        materialInboundMapper.updateById(original);

        String traceId = original.getTraceId() != null ? original.getTraceId()
                : "TR-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();

        LocalDateTime now = LocalDateTime.now();
        MaterialInbound reversal = new MaterialInbound();
        reversal.setId(UUID.randomUUID().toString().replace("-", ""));
        reversal.setInboundNo(buildNo("MRV", now));
        reversal.setMaterialCode(materialCode);
        reversal.setMaterialName(original.getMaterialName());
        reversal.setQuantity(reverseQty);
        reversal.setSourceType("reversal");
        reversal.setWarehouseLocation(original.getWarehouseLocation());
        reversal.setUnitPrice(original.getUnitPrice());
        reversal.setTotalAmount(original.getTotalAmount() != null ? original.getTotalAmount().negate() : null);
        reversal.setPaymentStatus("reversed");
        reversal.setPaidAmount(BigDecimal.ZERO);
        reversal.setReversalId(original.getId());
        reversal.setReversalStatus("NONE");
        reversal.setReversalReason(reason);
        reversal.setTraceId(traceId);
        reversal.setBatchNo(original.getBatchNo());
        reversal.setRemark(reason);
        reversal.setOperatorId(userId);
        reversal.setOperatorName(username);
        reversal.setInboundTime(now);
        reversal.setCreateTime(now);
        reversal.setUpdateTime(now);
        reversal.setDeleteFlag(0);
        reversal.setTenantId(tenantId);
        materialInboundMapper.insert(reversal);

        original.setReversedById(reversal.getId());
        original.setUpdateTime(LocalDateTime.now());
        materialInboundMapper.updateById(original);

        logStockChange("REVERSAL", stock, currentStock, -reverseQty, afterQty,
                reversal.getInboundNo(), "reversal", original.getUnitPrice(),
                reversal.getTotalAmount(), traceId, userId, username, tenantId);

        log.info("[物料冲销] originalId={} reversalId={} materialCode={} -{} reason={}",
                original.getId(), reversal.getId(), materialCode, reverseQty, reason);
        return reversal;
    }

    @Transactional(rollbackFor = Exception.class)
    public MaterialInbound edit(String inboundId, Map<String, Object> changes) {
        TenantAssert.assertTenantContext();

        if (!StringUtils.hasText(inboundId)) {
            throw new IllegalArgumentException("入库记录ID不能为空");
        }
        if (changes == null || changes.isEmpty()) {
            throw new IllegalArgumentException("修改内容不能为空");
        }

        MaterialInbound current = materialInboundMapper.selectById(inboundId);
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new IllegalArgumentException("入库记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "物料入库记录");

        if ("REVERSED".equals(current.getReversalStatus())) {
            throw new IllegalArgumentException("已冲销记录不能编辑");
        }

        if (changes.containsKey("warehouseLocation")) {
            current.setWarehouseLocation(trimToNull(changes.get("warehouseLocation")));
        }
        if (changes.containsKey("remark")) {
            current.setRemark(trimToNull(changes.get("remark")));
        }
        if (changes.containsKey("unitPrice")) {
            BigDecimal newPrice = toBigDecimal(changes.get("unitPrice"));
            current.setUnitPrice(newPrice);
            if (newPrice != null && current.getQuantity() != null) {
                current.setTotalAmount(newPrice.multiply(BigDecimal.valueOf(current.getQuantity())));
            }
        }

        current.setUpdateTime(LocalDateTime.now());
        materialInboundMapper.updateById(current);

        log.info("[物料入库编辑] id={}", inboundId);
        return current;
    }

    @Transactional(rollbackFor = Exception.class)
    public MaterialOutboundLog freeOutbound(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        String materialCode = trimToNull(params.get("materialCode"));
        Integer quantity = toInt(params.get("quantity"));
        String outstockType = trimToNull(params.get("outstockType"));
        String remark = trimToNull(params.get("remark"));
        String receiverName = trimToNull(params.get("receiverName"));
        String traceId = trimToNull(params.get("traceId"));

        if (!StringUtils.hasText(materialCode)) {
            throw new IllegalArgumentException("物料编码不能为空");
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

        MaterialStock stock = materialStockService.getOne(
                new LambdaQueryWrapper<MaterialStock>()
                        .eq(MaterialStock::getMaterialCode, materialCode)
                        .eq(MaterialStock::getDeleteFlag, 0)
                        .last("LIMIT 1"));
        if (stock == null) {
            throw new IllegalArgumentException("物料不存在: " + materialCode);
        }

        int beforeQty = stock.getQuantity() != null ? stock.getQuantity() : 0;
        int available = beforeQty - (stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0);
        if (available < quantity) {
            throw new IllegalArgumentException("库存不足: " + materialCode + "，可用:" + available + stock.getUnit() + "，申请:" + quantity + stock.getUnit());
        }

        materialStockService.decreaseStockById(stock.getId(), quantity);
        int afterQty = beforeQty - quantity;

        if (!StringUtils.hasText(traceId)) {
            traceId = "TR-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();
        }

        MaterialOutboundLog logEntry = new MaterialOutboundLog();
        LocalDateTime now = LocalDateTime.now();
        logEntry.setId(UUID.randomUUID().toString().replace("-", ""));
        logEntry.setOutboundNo(buildNo("MOB", now));
        logEntry.setSourceType(outstockType);
        logEntry.setStockId(stock.getId());
        logEntry.setMaterialCode(stock.getMaterialCode());
        logEntry.setMaterialName(stock.getMaterialName());
        logEntry.setQuantity(quantity);
        logEntry.setOperatorId(UserContext.userId());
        logEntry.setOperatorName(UserContext.username());
        logEntry.setReceiverName(receiverName);
        logEntry.setWarehouseLocation(stock.getLocation());
        logEntry.setRemark(remark);
        logEntry.setOutboundTime(now);
        logEntry.setCreateTime(now);
        logEntry.setDeleteFlag(0);
        logEntry.setTenantId(tenantId);
        materialOutboundLogMapper.insert(logEntry);

        logStockChange("OUTSTOCK", stock, beforeQty, -quantity, afterQty,
                logEntry.getOutboundNo(), outstockType, stock.getUnitPrice(),
                stock.getUnitPrice() != null ? stock.getUnitPrice().multiply(BigDecimal.valueOf(quantity)) : null,
                traceId, UserContext.userId(), UserContext.username(), tenantId);

        log.info("[物料出库] materialCode={} -{} 类型={} traceId={}", materialCode, quantity, outstockType, traceId);
        return logEntry;
    }

    @Transactional(rollbackFor = Exception.class)
    public MaterialStock scanInbound(String materialCode, int quantity, String warehouseLocation, String sourceType, String remark) {
        Map<String, Object> params = new HashMap<>();
        params.put("materialCode", materialCode);
        params.put("quantity", quantity);
        params.put("warehouseLocation", warehouseLocation != null ? warehouseLocation : "默认仓");
        params.put("sourceType", sourceType != null ? sourceType : "scan_inbound");
        params.put("remark", remark);
        freeInbound(params);
        return materialStockService.getOne(
                new LambdaQueryWrapper<MaterialStock>()
                        .eq(MaterialStock::getMaterialCode, materialCode)
                        .eq(MaterialStock::getDeleteFlag, 0)
                        .last("LIMIT 1"));
    }

    @Transactional(rollbackFor = Exception.class)
    public MaterialOutboundLog scanOutbound(String materialCode, int quantity, String outstockType, String remark) {
        Map<String, Object> params = new HashMap<>();
        params.put("materialCode", materialCode);
        params.put("quantity", quantity);
        params.put("outstockType", outstockType != null ? outstockType : "scan_outbound");
        params.put("remark", remark);
        return freeOutbound(params);
    }

    public Map<String, Object> scanQuery(String materialCode) {
        Long tenantId = UserContext.tenantId();
        MaterialStock stock = materialStockService.getOne(
                new LambdaQueryWrapper<MaterialStock>()
                        .eq(MaterialStock::getMaterialCode, materialCode)
                        .eq(MaterialStock::getTenantId, tenantId)
                        .eq(MaterialStock::getDeleteFlag, 0)
                        .last("LIMIT 1"));
        if (stock == null) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("found", false);
            r.put("message", "物料不存在: " + materialCode);
            return r;
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("found", true);
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

    public Map<String, Object> getAmountTrace(String traceId) {
        if (!StringUtils.hasText(traceId)) {
            return Collections.emptyMap();
        }
        Long tenantId = UserContext.tenantId();

        List<MaterialInbound> inboundList = materialInboundMapper.selectList(
                new LambdaQueryWrapper<MaterialInbound>()
                        .eq(MaterialInbound::getTraceId, traceId)
                        .eq(MaterialInbound::getTenantId, tenantId)
                        .eq(MaterialInbound::getDeleteFlag, 0)
                        .orderByAsc(MaterialInbound::getCreateTime));

        List<StockChangeLog> stockLogs = stockChangeLogService.list(
                new LambdaQueryWrapper<StockChangeLog>()
                        .eq(StockChangeLog::getTraceId, traceId)
                        .eq(StockChangeLog::getTenantId, tenantId)
                        .orderByAsc(StockChangeLog::getCreateTime));

        BigDecimal totalInbound = BigDecimal.ZERO;
        BigDecimal totalReversal = BigDecimal.ZERO;
        for (MaterialInbound inbound : inboundList) {
            if ("reversal".equals(inbound.getSourceType())) {
                totalReversal = totalReversal.add(inbound.getTotalAmount() != null ? inbound.getTotalAmount().abs() : BigDecimal.ZERO);
            } else {
                totalInbound = totalInbound.add(inbound.getTotalAmount() != null ? inbound.getTotalAmount() : BigDecimal.ZERO);
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("traceId", traceId);
        result.put("inboundRecords", inboundList);
        result.put("stockChangeLogs", stockLogs);
        result.put("totalInboundAmount", totalInbound);
        result.put("totalReversalAmount", totalReversal);
        result.put("netAmount", totalInbound.subtract(totalReversal));
        result.put("recordCount", inboundList.size());
        return result;
    }

    private void logStockChange(String changeType, MaterialStock stock, int beforeQty, int delta, int afterQty,
                                 String bizNo, String bizType, BigDecimal unitPrice, BigDecimal totalAmount,
                                 String traceId, String operatorId, String operatorName, Long tenantId) {
        try {
            StockChangeLog scl = new StockChangeLog();
            scl.setId(UUID.randomUUID().toString().replace("-", ""));
            scl.setChangeNo(buildNo("MSC", LocalDateTime.now()));
            scl.setChangeType(changeType);
            scl.setStockType("MATERIAL");
            scl.setStyleNo(stock.getMaterialCode());
            scl.setColor(stock.getColor());
            scl.setSize(stock.getSize());
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
            log.warn("[StockChangeLog] 物料库存变动日志保存失败: {}", e.getMessage());
        }
    }

    private MaterialStock autoCreateMaterialStock(String materialCode, Map<String, Object> params, Long tenantId) {
        MaterialStock stock = new MaterialStock();
        stock.setId(UUID.randomUUID().toString().replace("-", ""));
        stock.setMaterialCode(materialCode);
        stock.setMaterialName(trimToNull(params.get("materialName")));
        stock.setColor(trimToNull(params.get("color")));
        stock.setSize(trimToNull(params.get("size")));
        stock.setUnit(trimToNull(params.get("unit")));
        stock.setQuantity(0);
        stock.setLockedQuantity(0);
        stock.setUnitPrice(toBigDecimal(params.get("unitPrice")));
        stock.setLocation(trimToNull(params.get("warehouseLocation")));
        stock.setDeleteFlag(0);
        stock.setCreateTime(LocalDateTime.now());
        stock.setUpdateTime(LocalDateTime.now());
        stock.setTenantId(tenantId);
        materialStockService.save(stock);
        log.info("[物料入库] 自动创建库存记录: materialCode={}", materialCode);
        return stock;
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
