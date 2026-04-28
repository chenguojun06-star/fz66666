package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.helper.StyleBomMaterialSyncHelper;
import com.fashion.supplychain.style.helper.StyleBomPurchaseHelper;
import java.math.RoundingMode;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.service.MaterialStockService;

@Service
@Slf4j
public class StyleBomOrchestrator {

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleBomMaterialSyncHelper materialSyncHelper;

    @Autowired
    private StyleBomPurchaseHelper purchaseHelper;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private StyleQuotationOrchestrator styleQuotationOrchestrator;

    public List<StyleBom> listByStyleId(Long styleId) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        return styleBomService.listByStyleId(styleId);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean save(StyleBom styleBom) {
        if (styleBom == null || styleBom.getStyleId() == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        normalizeAndCalc(styleBom);
        if (styleBom.getCreateTime() == null) {
            styleBom.setCreateTime(LocalDateTime.now());
        }
        styleBom.setUpdateTime(LocalDateTime.now());
        boolean ok = styleBomService.save(styleBom);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        try {
            styleQuotationOrchestrator.recalculateFromLiveData(styleBom.getStyleId());
        } catch (Exception e) {
            log.warn("Auto-sync quotation failed after BOM save: styleId={}, error={}", styleBom.getStyleId(), e.getMessage());
        }

        try {
            String currentUser = UserContext.username();
            if (StringUtils.hasText(currentUser)) {
                StyleInfo styleInfo = styleInfoService.getById(styleBom.getStyleId());
                if (styleInfo != null) {
                    TenantAssert.assertBelongsToCurrentTenant(styleInfo.getTenantId(), "款式");
                }
                if (styleInfo != null && !StringUtils.hasText(styleInfo.getOrderType())) {
                    styleInfo.setOrderType(currentUser);
                    styleInfoService.updateById(styleInfo);
                    log.info("Synced merchandiser to style info: styleId={}, merchandiser={}", styleBom.getStyleId(), currentUser);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to sync merchandiser: styleId={}, error={}", styleBom.getStyleId(), e.getMessage());
        }

        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean update(StyleBom styleBom) {
        if (styleBom == null || styleBom.getId() == null) {
            throw new IllegalArgumentException("id不能为空");
        }
        StyleBom current = styleBomService.getById(styleBom.getId());
        if (current == null) {
            throw new NoSuchElementException("记录不存在");
        }
        com.fashion.supplychain.common.tenant.TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "BOM记录");
        if (styleBom.getStyleId() == null) {
            styleBom.setStyleId(current.getStyleId());
        }
        normalizeAndCalc(styleBom);
        styleBom.setUpdateTime(LocalDateTime.now());
        boolean ok = styleBomService.updateById(styleBom);

        if (ok) {
            Long sid = styleBom.getStyleId() != null ? styleBom.getStyleId() : current.getStyleId();
            try {
                styleQuotationOrchestrator.recalculateFromLiveData(sid);
            } catch (Exception e) {
                log.warn("Auto-sync quotation failed after BOM update: styleId={}, error={}", sid, e.getMessage());
            }
        }

        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(String id) {
        StyleBom current = styleBomService.getById(id);
        if (current != null) {
            com.fashion.supplychain.common.tenant.TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "BOM记录");
        }
        Long styleId = current != null ? current.getStyleId() : null;

        boolean ok = styleBomService.removeById(id);
        if (!ok) {
            if (current == null) {
                log.warn("[BOM-DELETE] id={} not found in DB, idempotent success (stale Redis cache?)", id);
                return true;
            }
            throw new IllegalStateException("删除失败");
        }

        if (styleId != null) {
            styleBomService.clearBomCache(styleId);
        }

        if (styleId != null) {
            try {
                styleQuotationOrchestrator.recalculateFromLiveData(styleId);
            } catch (Exception e) {
                log.warn("Auto-sync quotation failed after BOM delete: styleId={}, error={}", styleId, e.getMessage());
            }
        }
        return true;
    }

    public Map<String, Object> syncToMaterialDatabase(Long styleId, boolean forceUpdateCompleted) {
        return materialSyncHelper.syncToMaterialDatabase(styleId, forceUpdateCompleted);
    }

    public Map<String, Object> startSyncToMaterialDatabaseJob(Long styleId, boolean forceUpdateCompleted) {
        return materialSyncHelper.startSyncToMaterialDatabaseJob(styleId, forceUpdateCompleted);
    }

    public Map<String, Object> getSyncJob(String jobId) {
        return materialSyncHelper.getSyncJob(jobId);
    }

    @Transactional(rollbackFor = Exception.class)
    public List<StyleBom> saveBomWithStockCheck(List<StyleBom> bomList, Integer productionQty) {
        if (bomList == null || bomList.isEmpty()) {
            throw new RuntimeException("BOM列表不能为空");
        }
        if (productionQty == null || productionQty <= 0) {
            throw new RuntimeException("生产数量必须大于0");
        }

        Long styleId = bomList.get(0).getStyleId();
        log.info("开始保存BOM并检查库存: 款号ID={}, 生产数量={}, BOM条数={}",
                styleId, productionQty, bomList.size());

        styleBomService.clearBomCache(styleId);

        for (StyleBom bom : bomList) {
            int requiredQty = calculateRequirement(bom, productionQty);
            MaterialStock stock = findStock(bom);

            int availableQty = 0;
            if (stock != null) {
                availableQty = (stock.getQuantity() != null ? stock.getQuantity() : 0)
                             - (stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0);
                availableQty = Math.max(0, availableQty);
            }

            if (availableQty >= requiredQty) {
                bom.setStockStatus("sufficient");
                bom.setRequiredPurchase(0);
            } else if (availableQty > 0) {
                bom.setStockStatus("insufficient");
                bom.setRequiredPurchase(requiredQty - availableQty);
            } else {
                bom.setStockStatus("none");
                bom.setRequiredPurchase(requiredQty);
            }
            bom.setAvailableStock(availableQty);

            log.debug("BOM库存检查: 物料={}, 颜色={}, 需求={}, 可用={}, 状态={}, 需采购={}",
                    bom.getMaterialCode(), bom.getColor(), requiredQty, availableQty,
                    bom.getStockStatus(), bom.getRequiredPurchase());
        }

        List<StyleBom> existingBoms = bomList.stream()
                .filter(bom -> bom.getId() != null && !bom.getId().trim().isEmpty())
                .collect(Collectors.toList());

        if (!existingBoms.isEmpty()) {
            styleBomService.updateBatchById(existingBoms);
            log.info("BOM库存状态更新完成: 更新了{}条记录", existingBoms.size());
        } else {
            log.warn("BOM列表中没有已保存的记录，跳过更新");
        }

        return bomList;
    }

    public Map<String, Object> getBomStockSummary(Long styleId, Integer productionQty) {
        List<StyleBom> bomList = styleBomService.listByStyleId(styleId);

        if (bomList.isEmpty()) {
            Map<String, Object> emptySummary = new HashMap<>();
            emptySummary.put("totalItems", 0);
            emptySummary.put("sufficientCount", 0);
            emptySummary.put("insufficientCount", 0);
            emptySummary.put("noneCount", 0);
            emptySummary.put("allSufficient", false);
            return emptySummary;
        }

        int totalItems = bomList.size();
        int sufficientCount = 0;
        int insufficientCount = 0;
        int noneCount = 0;
        int totalRequiredPurchase = 0;
        BigDecimal totalPurchaseValue = BigDecimal.ZERO;

        for (StyleBom bom : bomList) {
            if (bom.getStockStatus() == null || "unchecked".equals(bom.getStockStatus())) {
                int requiredQty = calculateRequirement(bom, productionQty);
                MaterialStock stock = findStock(bom);
                int availableQty = 0;
                if (stock != null) {
                    availableQty = Math.max(0,
                            (stock.getQuantity() != null ? stock.getQuantity() : 0)
                                    - (stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0));
                }

                if (availableQty >= requiredQty) {
                    bom.setStockStatus("sufficient");
                    bom.setRequiredPurchase(0);
                } else if (availableQty > 0) {
                    bom.setStockStatus("insufficient");
                    bom.setRequiredPurchase(requiredQty - availableQty);
                } else {
                    bom.setStockStatus("none");
                    bom.setRequiredPurchase(requiredQty);
                }
                bom.setAvailableStock(availableQty);
            }

            switch (bom.getStockStatus()) {
                case "sufficient":
                    sufficientCount++;
                    break;
                case "insufficient":
                    insufficientCount++;
                    break;
                case "none":
                    noneCount++;
                    break;
            }

            if (bom.getRequiredPurchase() != null && bom.getRequiredPurchase() > 0) {
                totalRequiredPurchase += bom.getRequiredPurchase();
                if (bom.getUnitPrice() != null) {
                    BigDecimal purchaseValue = bom.getUnitPrice()
                            .multiply(BigDecimal.valueOf(bom.getRequiredPurchase()));
                    totalPurchaseValue = totalPurchaseValue.add(purchaseValue);
                }
            }
        }

        Map<String, Object> summary = new HashMap<>();
        summary.put("totalItems", totalItems);
        summary.put("sufficientCount", sufficientCount);
        summary.put("insufficientCount", insufficientCount);
        summary.put("noneCount", noneCount);
        summary.put("allSufficient", sufficientCount == totalItems);
        summary.put("totalRequiredPurchase", totalRequiredPurchase);
        summary.put("totalPurchaseValue", totalPurchaseValue);
        summary.put("bomList", bomList);

        return summary;
    }

    private int calculateRequirement(StyleBom bom, Integer productionQty) {
        if (bom.getUsageAmount() == null) {
            return 0;
        }
        BigDecimal usageAmount = bom.getUsageAmount();
        BigDecimal qty = BigDecimal.valueOf(productionQty);
        BigDecimal lossRate = bom.getLossRate() != null ? bom.getLossRate() : BigDecimal.ZERO;
        BigDecimal lossFactor = BigDecimal.ONE.add(lossRate.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP));
        BigDecimal requirement = usageAmount.multiply(qty).multiply(lossFactor);
        return requirement.setScale(0, RoundingMode.UP).intValue();
    }

    private MaterialStock findStock(StyleBom bom) {
        LambdaQueryWrapper<MaterialStock> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialStock::getMaterialCode, bom.getMaterialCode());
        if (bom.getColor() != null && !bom.getColor().trim().isEmpty()) {
            wrapper.eq(MaterialStock::getColor, bom.getColor());
        }
        if (bom.getSize() != null && !bom.getSize().trim().isEmpty()) {
            wrapper.eq(MaterialStock::getSize, bom.getSize());
        }
        List<MaterialStock> stockList = materialStockService.list(wrapper);
        if (stockList.isEmpty()) {
            return null;
        }
        return stockList.stream()
                .max((s1, s2) -> {
                    int qty1 = (s1.getQuantity() != null ? s1.getQuantity() : 0)
                            - (s1.getLockedQuantity() != null ? s1.getLockedQuantity() : 0);
                    int qty2 = (s2.getQuantity() != null ? s2.getQuantity() : 0)
                            - (s2.getLockedQuantity() != null ? s2.getLockedQuantity() : 0);
                    return Integer.compare(qty1, qty2);
                })
                .orElse(null);
    }

    private void normalizeAndCalc(StyleBom styleBom) {
        styleBom.setGroupName(null);
        BigDecimal usageAmount = styleBom.getUsageAmount() == null ? BigDecimal.ZERO : styleBom.getUsageAmount();
        BigDecimal lossRate = styleBom.getLossRate() == null ? BigDecimal.ZERO : styleBom.getLossRate();
        BigDecimal unitPrice = styleBom.getUnitPrice() == null ? BigDecimal.ZERO : styleBom.getUnitPrice();

        BigDecimal qty = usageAmount.multiply(BigDecimal.ONE.add(lossRate.movePointLeft(2)));
        styleBom.setTotalPrice(qty.multiply(unitPrice));
    }

    @Transactional(rollbackFor = Exception.class)
    public int generatePurchase(Long styleId) {
        return purchaseHelper.generatePurchase(styleId);
    }

    @Transactional(rollbackFor = Exception.class)
    public int generatePurchase(Long styleId, boolean force) {
        return purchaseHelper.generatePurchase(styleId, force);
    }
}
