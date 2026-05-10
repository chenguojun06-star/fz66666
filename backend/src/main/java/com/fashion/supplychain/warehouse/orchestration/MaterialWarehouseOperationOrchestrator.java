package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialOutboundLogMapper;
import com.fashion.supplychain.production.service.MaterialStockService;
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
    private final MaterialOutboundLogMapper materialOutboundLogMapper;

    private static final Set<String> VALID_SOURCE_TYPES = Set.of(
            "external_purchase", "free_inbound", "transfer_in", "return_in", "other_in", "scan_inbound");

    private static final Set<String> VALID_OUTSTOCK_TYPES = Set.of(
            "free_outbound", "sample_out", "damage_out", "transfer_out", "other_out", "scan_outbound");

    @Transactional(rollbackFor = Exception.class)
    public MaterialStock freeInbound(Map<String, Object> params) {
        TenantAssert.assertTenantContext();

        String materialCode = trimToNull(params.get("materialCode"));
        Integer quantity = toInt(params.get("quantity"));
        String warehouseLocation = trimToNull(params.get("warehouseLocation"));
        String sourceType = trimToNull(params.get("sourceType"));
        String remark = trimToNull(params.get("remark"));
        String supplierName = trimToNull(params.get("supplierName"));

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
                        .eq(MaterialStock::getDeleteFlag, 0)
                        .last("LIMIT 1"));
        if (stock == null) {
            throw new IllegalArgumentException("物料不存在: " + materialCode);
        }

        materialStockService.updateStockQuantity(stock.getId(), quantity);
        log.info("[物料入库] materialCode={} +{} 来源={} 仓位={}", materialCode, quantity, sourceType, warehouseLocation);
        return stock;
    }

    @Transactional(rollbackFor = Exception.class)
    public MaterialOutboundLog freeOutbound(Map<String, Object> params) {
        TenantAssert.assertTenantContext();

        String materialCode = trimToNull(params.get("materialCode"));
        Integer quantity = toInt(params.get("quantity"));
        String outstockType = trimToNull(params.get("outstockType"));
        String remark = trimToNull(params.get("remark"));
        String receiverName = trimToNull(params.get("receiverName"));

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

        int available = (stock.getQuantity() != null ? stock.getQuantity() : 0)
                - (stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0);
        if (available < quantity) {
            throw new IllegalArgumentException("库存不足: " + materialCode + "，可用:" + available + stock.getUnit() + "，申请:" + quantity + stock.getUnit());
        }

        materialStockService.decreaseStockById(stock.getId(), quantity);

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
        logEntry.setTenantId(UserContext.tenantId());
        materialOutboundLogMapper.insert(logEntry);

        log.info("[物料出库] materialCode={} -{} 类型={}", materialCode, quantity, outstockType);
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
        return freeInbound(params);
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
        MaterialStock stock = materialStockService.getOne(
                new LambdaQueryWrapper<MaterialStock>()
                        .eq(MaterialStock::getMaterialCode, materialCode)
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
}
