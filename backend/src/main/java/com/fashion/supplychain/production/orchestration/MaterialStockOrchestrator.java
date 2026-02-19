package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.dto.MaterialStockAlertDto;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialPickingItemMapper;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.service.StyleBomService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class MaterialStockOrchestrator {

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialPickingItemMapper materialPickingItemMapper;

    @Autowired
    private StyleBomService styleBomService;

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
