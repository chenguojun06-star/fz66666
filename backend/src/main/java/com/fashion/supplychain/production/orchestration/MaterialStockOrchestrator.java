package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.MaterialStockAlertDto;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialOutboundLogMapper;
import com.fashion.supplychain.production.mapper.MaterialPickingItemMapper;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.warehouse.orchestration.MaterialPickupOrchestrator;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class MaterialStockOrchestrator {

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialPickingItemMapper materialPickingItemMapper;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private MaterialOutboundLogMapper materialOutboundLogMapper;

    @Autowired
    private MaterialPickupOrchestrator materialPickupOrchestrator;

    private final AtomicInteger outboundSequence = new AtomicInteger(0);

    public List<MaterialStockAlertDto> listAlerts(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : params;
        int days = Math.max(1, ParamUtils.getIntOrDefault(safeParams, "days", 30));
        int leadDays = Math.max(1, ParamUtils.getIntOrDefault(safeParams, "leadDays", 7));
        int limit = Math.max(0, ParamUtils.getIntOrDefault(safeParams, "limit", 0));
        boolean onlyNeed = "true".equalsIgnoreCase(String.valueOf(safeParams.get("onlyNeed")));

        LocalDateTime startTime = LocalDateTime.now().minusDays(days);

        List<MaterialStock> stocks = materialStockService.list(new LambdaQueryWrapper<MaterialStock>()
                .eq(MaterialStock::getDeleteFlag, 0));

        if (stocks == null || stocks.isEmpty()) {
            return new ArrayList<>();
        }

        List<MaterialPickingItem> pickingItems = materialPickingItemMapper.selectList(
                new LambdaQueryWrapper<MaterialPickingItem>()
                        .ge(MaterialPickingItem::getCreateTime, startTime));

        Map<String, BigDecimal> usageByMaterial = buildUsageMap(stocks);

        Map<String, Summary> byStockId = new HashMap<>();
        Map<String, Summary> byMaterialKey = new HashMap<>();

        if (pickingItems != null) {
            for (MaterialPickingItem item : pickingItems) {
                if (item == null) {
                    continue;
                }
                int qty = item.getQuantity() == null ? 0 : item.getQuantity();
                if (qty <= 0) {
                    continue;
                }
                LocalDateTime time = item.getCreateTime();
                String stockId = trimToNull(item.getMaterialStockId());
                if (stockId != null) {
                    Summary summary = byStockId.computeIfAbsent(stockId, k -> new Summary());
                    summary.add(qty, time);
                }

                String materialKey = buildMaterialKey(item.getMaterialId(), item.getColor(), item.getSize());
                if (materialKey != null) {
                    Summary summary = byMaterialKey.computeIfAbsent(materialKey, k -> new Summary());
                    summary.add(qty, time);
                }
            }
        }

        List<MaterialStockAlertDto> alerts = new ArrayList<>();
        for (MaterialStock stock : stocks) {
            if (stock == null) {
                continue;
            }
            String stockId = trimToNull(stock.getId());
            Summary summary = stockId == null ? null : byStockId.get(stockId);
            if (summary == null) {
                String materialKey = buildMaterialKey(stock.getMaterialId(), stock.getColor(), stock.getSize());
                summary = materialKey == null ? null : byMaterialKey.get(materialKey);
            }

            int recentOutQty = summary == null ? 0 : summary.quantity;
            int dailyOutQty = (int) Math.ceil(recentOutQty / (double) days);
            int safetyStock = stock.getSafetyStock() == null ? 0 : stock.getSafetyStock();
            int suggestedSafety = Math.max(safetyStock, dailyOutQty * leadDays);
            int quantity = stock.getQuantity() == null ? 0 : stock.getQuantity();
            boolean need = quantity < suggestedSafety;

            BigDecimal perPieceUsage = resolveUsage(usageByMaterial, stock);
            Integer minProductionQty = calcProductionQty(quantity, perPieceUsage);
            Integer maxProductionQty = calcProductionQty(suggestedSafety, perPieceUsage);

            if (onlyNeed && !need) {
                continue;
            }

            MaterialStockAlertDto dto = new MaterialStockAlertDto();
            dto.setStockId(stockId);
            dto.setMaterialId(stock.getMaterialId());
            dto.setMaterialCode(stock.getMaterialCode());
            dto.setMaterialName(stock.getMaterialName());
            dto.setMaterialType(stock.getMaterialType());
            dto.setUnit(stock.getUnit());
            dto.setColor(stock.getColor());
            dto.setSize(stock.getSize());
            dto.setQuantity(quantity);
            dto.setSafetyStock(safetyStock);
            dto.setRecentOutQuantity(recentOutQty);
            dto.setSuggestedSafetyStock(suggestedSafety);
            dto.setDailyOutQuantity(dailyOutQty);
            dto.setNeedReplenish(need);
            dto.setLastOutTime(summary == null ? null : summary.lastTime);
            dto.setPerPieceUsage(perPieceUsage);
            dto.setMinProductionQty(minProductionQty);
            dto.setMaxProductionQty(maxProductionQty);
            dto.setSupplierName(stock.getSupplierName());
            dto.setFabricWidth(stock.getFabricWidth());
            dto.setFabricWeight(stock.getFabricWeight());
            dto.setFabricComposition(stock.getFabricComposition());
            alerts.add(dto);
        }

        alerts = alerts.stream()
                .sorted(Comparator
                        .comparing(MaterialStockAlertDto::getNeedReplenish, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(dto -> shortage(dto), Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(MaterialStockAlertDto::getRecentOutQuantity, Comparator.nullsLast(Comparator.reverseOrder())))
                .collect(Collectors.toList());

        if (limit > 0 && alerts.size() > limit) {
            return alerts.subList(0, limit);
        }
        return alerts;
    }

    @Transactional(rollbackFor = Exception.class)
    public String manualOutbound(
            String stockId,
            Integer quantity,
            String reason,
            String orderNo,
            String styleNo,
            String factoryId,
            String factoryName,
            String factoryType,
            String receiverId,
            String receiverName,
            String pickupType,
            String usageType) {
        if (!StringUtils.hasText(stockId)) {
            throw new IllegalArgumentException("库存记录不能为空");
        }
        if (quantity == null || quantity <= 0) {
            throw new IllegalArgumentException("出库数量必须大于0");
        }
        if (!StringUtils.hasText(receiverName)) {
            throw new IllegalArgumentException("领取人不能为空");
        }
        if (!StringUtils.hasText(orderNo)) {
            throw new IllegalArgumentException("关联订单不能为空");
        }
        if (!StringUtils.hasText(styleNo)) {
            throw new IllegalArgumentException("关联款号不能为空");
        }
        if (!StringUtils.hasText(factoryName)) {
            throw new IllegalArgumentException("关联工厂不能为空");
        }
        if (!StringUtils.hasText(usageType)) {
            throw new IllegalArgumentException("用料场景不能为空");
        }

        MaterialStock stock = materialStockService.getById(stockId);
        if (stock == null || stock.getDeleteFlag() != null && stock.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("库存记录不存在");
        }

        materialStockService.decreaseStockById(stockId, quantity);

        LocalDateTime outboundTime = LocalDateTime.now();
        String issuerId = StringUtils.hasText(UserContext.userId()) ? UserContext.userId().trim() : null;
        String issuerName = StringUtils.hasText(UserContext.username()) ? UserContext.username().trim() : "系统";
        String normalizedFactoryType = StringUtils.hasText(factoryType) ? factoryType.trim().toUpperCase() : null;
        String normalizedPickupType = StringUtils.hasText(pickupType)
                ? pickupType.trim().toUpperCase()
                : (StringUtils.hasText(normalizedFactoryType) ? normalizedFactoryType : "INTERNAL");
        String outboundNo = generateOutboundNo();

        MaterialOutboundLog log = new MaterialOutboundLog();
        log.setStockId(stockId);
        log.setOutboundNo(outboundNo);
        log.setSourceType("MANUAL_OUTBOUND");
        log.setPickupType(normalizedPickupType);
        log.setUsageType(usageType.trim());
        log.setOrderNo(orderNo.trim());
        log.setStyleNo(styleNo.trim());
        log.setFactoryId(StringUtils.hasText(factoryId) ? factoryId.trim() : null);
        log.setFactoryName(factoryName.trim());
        log.setFactoryType(normalizedFactoryType);
        log.setMaterialCode(stock.getMaterialCode());
        log.setMaterialName(stock.getMaterialName());
        log.setQuantity(quantity);
        log.setOperatorId(issuerId);
        log.setOperatorName(issuerName);
        log.setReceiverId(StringUtils.hasText(receiverId) ? receiverId.trim() : null);
        log.setReceiverName(receiverName.trim());
        log.setWarehouseLocation(stock.getLocation());
        log.setRemark(StringUtils.hasText(reason) ? reason.trim() : "手动出库");
        log.setOutboundTime(outboundTime);
        log.setCreateTime(outboundTime);
        log.setDeleteFlag(0);
        materialOutboundLogMapper.insert(log);

        MaterialStock patch = new MaterialStock();
        patch.setId(stockId);
        patch.setLastOutboundDate(outboundTime);
        patch.setUpdateTime(outboundTime);
        materialStockService.updateById(patch);

        Map<String, Object> pickupBody = new LinkedHashMap<>();
        pickupBody.put("pickupType", normalizedPickupType);
        pickupBody.put("movementType", "OUTBOUND");
        pickupBody.put("sourceType", "MANUAL_OUTBOUND");
        pickupBody.put("usageType", usageType.trim());
        pickupBody.put("sourceRecordId", log.getId());
        pickupBody.put("sourceDocumentNo", outboundNo);
        pickupBody.put("factoryId", StringUtils.hasText(factoryId) ? factoryId.trim() : null);
        pickupBody.put("factoryName", factoryName.trim());
        pickupBody.put("factoryType", normalizedFactoryType);
        pickupBody.put("orderNo", orderNo.trim());
        pickupBody.put("styleNo", styleNo.trim());
        pickupBody.put("materialId", stock.getMaterialId());
        pickupBody.put("materialCode", stock.getMaterialCode());
        pickupBody.put("materialName", stock.getMaterialName());
        pickupBody.put("materialType", stock.getMaterialType());
        pickupBody.put("color", stock.getColor());
        pickupBody.put("specification", stock.getSpecifications());
        pickupBody.put("fabricWidth", stock.getFabricWidth());
        pickupBody.put("fabricWeight", stock.getFabricWeight());
        pickupBody.put("fabricComposition", stock.getFabricComposition());
        pickupBody.put("quantity", quantity);
        pickupBody.put("unit", stock.getUnit());
        pickupBody.put("unitPrice", stock.getUnitPrice());
        pickupBody.put("receiverId", StringUtils.hasText(receiverId) ? receiverId.trim() : null);
        pickupBody.put("receiverName", receiverName.trim());
        pickupBody.put("issuerId", issuerId);
        pickupBody.put("issuerName", issuerName);
        pickupBody.put("warehouseLocation", stock.getLocation());
        pickupBody.put("remark", StringUtils.hasText(reason) ? reason.trim() : "手动出库");
        materialPickupOrchestrator.create(pickupBody);

        return outboundNo;
    }

    private static Integer shortage(MaterialStockAlertDto dto) {
        if (dto == null) {
            return 0;
        }
        int qty = dto.getQuantity() == null ? 0 : dto.getQuantity();
        int suggested = dto.getSuggestedSafetyStock() == null ? 0 : dto.getSuggestedSafetyStock();
        return Math.max(0, suggested - qty);
    }

    private static String buildMaterialKey(String materialId, String color, String size) {
        String mid = trimToNull(materialId);
        if (!StringUtils.hasText(mid)) {
            return null;
        }
        return String.join("|",
                mid,
                normalize(color),
                normalize(size));
    }

    private Map<String, BigDecimal> buildUsageMap(List<MaterialStock> stocks) {
        List<String> codes = stocks.stream()
                .map(MaterialStock::getMaterialCode)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());
        if (codes.isEmpty()) {
            return new HashMap<>();
        }
        List<StyleBom> boms = styleBomService.listByMaterialCodes(codes);
        Map<String, BigDecimal> usageMap = new HashMap<>();
        if (boms == null) {
            return usageMap;
        }
        for (StyleBom bom : boms) {
            if (bom == null || !StringUtils.hasText(bom.getMaterialCode())) {
                continue;
            }
            BigDecimal usage = bom.getUsageAmount() == null ? BigDecimal.ZERO : bom.getUsageAmount();
            if (usage.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            BigDecimal loss = bom.getLossRate() == null ? BigDecimal.ZERO : bom.getLossRate();
            BigDecimal factor = BigDecimal.ONE.add(loss.movePointLeft(2));
            BigDecimal perPiece = usage.multiply(factor);
            if (perPiece.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            String key = buildBomKey(bom.getMaterialCode(), bom.getColor(), bom.getSize());
            BigDecimal current = usageMap.get(key);
            if (current == null || perPiece.compareTo(current) > 0) {
                usageMap.put(key, perPiece);
            }
        }
        return usageMap;
    }

    private BigDecimal resolveUsage(Map<String, BigDecimal> usageMap, MaterialStock stock) {
        if (usageMap == null || usageMap.isEmpty() || stock == null) {
            return null;
        }
        String key = buildBomKey(stock.getMaterialCode(), stock.getColor(), stock.getSize());
        BigDecimal usage = usageMap.get(key);
        if (usage != null) {
            return usage;
        }
        String fallback = buildBomKey(stock.getMaterialCode(), null, null);
        return usageMap.get(fallback);
    }

    private String buildBomKey(String materialCode, String color, String size) {
        String code = trimToNull(materialCode);
        if (!StringUtils.hasText(code)) {
            return null;
        }
        return String.join("|",
                code,
                normalize(color),
                normalize(size));
    }

    private Integer calcProductionQty(int qty, BigDecimal perPiece) {
        if (perPiece == null || perPiece.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        return BigDecimal.valueOf(qty)
                .divide(perPiece, 0, java.math.RoundingMode.DOWN)
                .intValue();
    }

    private static String normalize(String value) {
        return StringUtils.hasText(value) ? value.trim() : "";
    }

    private static String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private String generateOutboundNo() {
        String date = DateTimeFormatter.ofPattern("yyyyMMddHHmmss").format(LocalDateTime.now());
        int seq = outboundSequence.incrementAndGet() % 1000;
        return String.format("MOB%s%03d", date, seq);
    }

    @Data
    private static class Summary {
        private int quantity;
        private LocalDateTime lastTime;

        void add(int qty, LocalDateTime time) {
            this.quantity += qty;
            if (time != null) {
                if (this.lastTime == null || time.isAfter(this.lastTime)) {
                    this.lastTime = time;
                }
            }
        }
    }
}
