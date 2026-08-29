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
import com.fashion.supplychain.style.helper.StyleBomLogAppendHelper;
import java.math.RoundingMode;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
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

    @Autowired
    private com.fashion.supplychain.style.helper.StyleStageCompletionHelper styleStageCompletionHelper;

    @Autowired
    private StyleBomLogAppendHelper logAppendHelper;

    public List<StyleBom> listByStyleId(Long styleId) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        Long tenantId = UserContext.tenantId();
        List<StyleBom> list = styleBomService.lambdaQuery()
                .eq(StyleBom::getStyleId, styleId)
                .eq(StyleBom::getTenantId, tenantId)
                .list();
        // D-108 库存实时刷新：DB 中的 stock_status/available_stock 是「检查库存」时的快照，
        // 领取/入库/出库后不会变（历史bug：库存永远显示58米）。列表返回前按 t_material_stock
        // 实时重算，快照仅作查询失败时的兜底展示。
        refreshStockSnapshotRealtime(list);
        return list;
    }

    /**
     * D-108 按物料库存表实时重算 BOM 行的 availableStock/stockStatus/requiredPurchase。
     * 匹配口径与 findStock 一致：materialCode + tenantId（必填），color/size 有值才过滤，取可用量最大的一行。
     * 单次批量 SQL 查询所有 materialCode，避免 N+1。productionQty=1 与「检查库存」前端默认口径一致。
     */
    private void refreshStockSnapshotRealtime(List<StyleBom> bomList) {
        if (bomList == null || bomList.isEmpty()) {
            return;
        }
        try {
            Set<String> materialCodes = bomList.stream()
                    .map(StyleBom::getMaterialCode)
                    .filter(StringUtils::hasText)
                    .collect(Collectors.toSet());
            if (materialCodes.isEmpty()) {
                return;
            }
            Long tenantId = UserContext.tenantId();
            Map<String, List<MaterialStock>> stocksByCode = materialStockService.list(
                    new LambdaQueryWrapper<MaterialStock>()
                            .eq(MaterialStock::getTenantId, tenantId)
                            .in(MaterialStock::getMaterialCode, materialCodes))
                    .stream()
                    .collect(Collectors.groupingBy(MaterialStock::getMaterialCode));

            for (StyleBom bom : bomList) {
                if (!StringUtils.hasText(bom.getMaterialCode())) {
                    continue;
                }
                int availableQty = stocksByCode.getOrDefault(bom.getMaterialCode(), Collections.emptyList())
                        .stream()
                        .filter(s -> !StringUtils.hasText(bom.getColor())
                                || java.util.Objects.equals(s.getColor(), bom.getColor()))
                        .filter(s -> !StringUtils.hasText(bom.getSize())
                                || java.util.Objects.equals(s.getSize(), bom.getSize()))
                        .mapToInt(s -> Math.max(0,
                                (s.getQuantity() != null ? s.getQuantity() : 0)
                                        - (s.getLockedQuantity() != null ? s.getLockedQuantity() : 0)))
                        .max()
                        .orElse(0);
                int requiredQty = calculateRequirement(bom, 1);
                bom.setAvailableStock(availableQty);
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
            }
        } catch (Exception e) {
            log.warn("BOM库存实时刷新失败（回退DB快照展示）: {}", e.getMessage());
        }
    }

    /**
     * P2 推送锁定：已推送下单的款式，BOM 快照已同步到订单，款式侧改动不再生效（静默漂移）。
     * 统一拦截写操作，提示到订单侧维护。
     */
    private void assertStyleNotPushedToOrder(Long styleId) {
        if (styleId == null) {
            return;
        }
        StyleInfo styleInfo = styleInfoService.getById(styleId);
        if (styleInfo != null) {
            TenantAssert.assertBelongsToCurrentTenant(styleInfo.getTenantId(), "款式");
            if (styleInfo.getPushedToOrder() != null && styleInfo.getPushedToOrder() == 1) {
                throw new IllegalStateException("该款式已推送下单，BOM已同步至订单；如需调整请先报废关联订单或联系管理员");
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean save(StyleBom styleBom) {
        if (styleBom == null || styleBom.getStyleId() == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        assertStyleNotPushedToOrder(styleBom.getStyleId());
        normalizeAndCalc(styleBom);
        if (styleBom.getCreateTime() == null) {
            styleBom.setCreateTime(LocalDateTime.now());
        }
        styleBom.setUpdateTime(LocalDateTime.now());
        boolean ok = styleBomService.save(styleBom);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        // 自动回填 BOM 开始时间（用户跳过"开始BOM配置"按钮直接添加数据时）
        styleStageCompletionHelper.autoStartStage(styleBom.getStyleId(), "bom");

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

        logAppendHelper.appendSave(styleBom.getId(), 1);
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
        assertStyleNotPushedToOrder(current.getStyleId());
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
            // BOM数量变更时，同步更新关联的pending采购任务
            try {
                int synced = purchaseHelper.syncPendingPurchasesOnBomChange(current, styleBom);
                if (synced > 0) {
                    log.info("BOM变更已同步{}条pending采购任务: styleId={}", synced, sid);
                }
            } catch (Exception e) {
                log.warn("BOM变更同步采购任务失败（不影响BOM保存）: styleId={}, error={}", sid, e.getMessage());
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
            assertStyleNotPushedToOrder(current.getStyleId());
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
        Map<String, Object> result = materialSyncHelper.syncToMaterialDatabase(styleId, forceUpdateCompleted);
        int created = result.get("created") != null ? ((Number) result.get("created")).intValue() : 0;
        int updated = result.get("updated") != null ? ((Number) result.get("updated")).intValue() : 0;
        logAppendHelper.appendSyncToMaterial(styleId, created + updated);
        return result;
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
        TenantAssert.assertTenantContext();

        Long styleId = bomList.get(0).getStyleId();
        assertStyleNotPushedToOrder(styleId);
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

            // D-153：单件用量未填/为0时需求为0，旧逻辑 0>=0 误判"库存充足"——
            // 没有需求就无法判定够不够，标记"未填用量"提醒补填
            if (requiredQty <= 0) {
                bom.setStockStatus("no_usage");
                bom.setRequiredPurchase(0);
            } else if (availableQty >= requiredQty) {
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

        int sufficientCount = (int) bomList.stream()
                .filter(bom -> "sufficient".equals(bom.getStockStatus()))
                .count();
        logAppendHelper.appendStockCheck(styleId, bomList.size(), sufficientCount);
        return bomList;
    }

    public Map<String, Object> getBomStockSummary(Long styleId, Integer productionQty) {
        Long tenantId = UserContext.tenantId();
        List<StyleBom> bomList = styleBomService.lambdaQuery()
                .eq(StyleBom::getStyleId, styleId)
                .eq(StyleBom::getTenantId, tenantId)
                .list();
        // D-108 汇总口径与列表一致：实时刷新库存，避免汇总与表格显示不一致
        refreshStockSnapshotRealtime(bomList);

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
        int noUsageCount = 0;
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

                // D-153：与 saveBomWithStockCheck 同口径——需求为0（用量未填）标记"未填用量"
                if (requiredQty <= 0) {
                    bom.setStockStatus("no_usage");
                    bom.setRequiredPurchase(0);
                } else if (availableQty >= requiredQty) {
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
                case "no_usage":
                    noUsageCount++;
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
        summary.put("noUsageCount", noUsageCount);
        summary.put("allSufficient", sufficientCount == totalItems);
        summary.put("totalRequiredPurchase", totalRequiredPurchase);
        summary.put("totalPurchaseValue", totalPurchaseValue);
        summary.put("bomList", bomList);

        return summary;
    }

    private int calculateRequirement(StyleBom bom, Integer productionQty) {
        // D-214：用量口径与前端 calcTotalPrice/生成采购单对齐（pickEffectiveUsage）——
        // 开发阶段（尚无纸样数据）按开发采购量 devUsageAmount 判库存；
        // 纸样完成后（patternSizeUsageMap 非空）才按实际纸样用量 usageAmount。
        // 旧逻辑只认 usageAmount，只填了开发采购量的物料被误判"未填用量"。
        BigDecimal usageAmount = pickEffectiveUsage(bom);
        if (usageAmount == null || usageAmount.compareTo(BigDecimal.ZERO) <= 0) {
            return 0;
        }
        BigDecimal qty = BigDecimal.valueOf(productionQty);
        BigDecimal lossRate = bom.getLossRate() != null ? bom.getLossRate() : BigDecimal.ZERO;
        BigDecimal lossFactor = BigDecimal.ONE.add(lossRate.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP));
        BigDecimal requirement = usageAmount.multiply(qty).multiply(lossFactor);
        return requirement.setScale(0, RoundingMode.UP).intValue();
    }

    private MaterialStock findStock(StyleBom bom) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<MaterialStock> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialStock::getMaterialCode, bom.getMaterialCode());
        wrapper.eq(MaterialStock::getTenantId, tenantId);
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
        // 列宽防御：size/color 列为 VARCHAR(500)（V202708201800 扩列），
        // 超长时提前给出明确提示，避免 DataIntegrityViolationException 500（"Data too long for column"）
        assertFieldLength(styleBom.getSize(), 500, "尺码/规格");
        assertFieldLength(styleBom.getColor(), 500, "颜色");
        // 部位字段兜底：未指定部位时默认"整件"
        // 与前端 calcTotalPrice 逻辑对齐：使用 effectiveUsage（有纸样数据时用 usageAmount，否则用 devUsageAmount 兜底）
        if (!StringUtils.hasText(styleBom.getPartCode())) {
            styleBom.setPartCode("GARMENT_PART_WHOLE");
            styleBom.setPartName("整件");
        }
        BigDecimal usageAmount = pickEffectiveUsage(styleBom);
        BigDecimal lossRate = styleBom.getLossRate() == null ? BigDecimal.ZERO : styleBom.getLossRate();
        BigDecimal unitPrice = styleBom.getUnitPrice() == null ? BigDecimal.ZERO : styleBom.getUnitPrice();

        // 精度控制：用量保留4位小数，避免前端浮点数精度污染（如0.99999999）
        usageAmount = usageAmount.setScale(4, RoundingMode.HALF_UP);
        BigDecimal qty = usageAmount.multiply(BigDecimal.ONE.add(lossRate.movePointLeft(2)));
        styleBom.setTotalPrice(qty.multiply(unitPrice).setScale(2, RoundingMode.HALF_UP));
    }

    private void assertFieldLength(String value, int maxLength, String fieldLabel) {
        if (value != null && value.length() > maxLength) {
            throw new IllegalArgumentException(
                    fieldLabel + "过长（" + value.length() + " 字符，上限 " + maxLength + "），请减少拼接的码数/颜色数量");
        }
    }

    /**
     * 与前端 calcTotalPrice 逻辑对齐：选择有效用量
     * - 有纸样数据（patternSizeUsageMap 非空）→ 用 usageAmount
     * - 否则 → 优先用 devUsageAmount，为空则用 usageAmount
     */
    private BigDecimal pickEffectiveUsage(StyleBom styleBom) {
        String patternUsageMap = styleBom.getPatternSizeUsageMap();
        boolean hasPatternData = StringUtils.hasText(patternUsageMap)
                && patternUsageMap.trim().length() > 2; // 简单判断非 "{}" 等空对象
        if (hasPatternData) {
            return styleBom.getUsageAmount() == null ? BigDecimal.ZERO : styleBom.getUsageAmount();
        }
        BigDecimal dev = styleBom.getDevUsageAmount();
        BigDecimal usage = styleBom.getUsageAmount();
        if (dev != null && dev.compareTo(BigDecimal.ZERO) > 0) {
            return dev;
        }
        return usage == null ? BigDecimal.ZERO : usage;
    }

    @Transactional(rollbackFor = Exception.class)
    public int generatePurchase(Long styleId) {
        return generatePurchase(styleId, false);
    }

    @Transactional(rollbackFor = Exception.class)
    public int generatePurchase(Long styleId, boolean force) {
        return purchaseHelper.generatePurchase(styleId, force);
    }

    public java.util.Map<String, Object> getPurchaseStatus(Long styleId) {
        return purchaseHelper.getPurchaseStatus(styleId);
    }
}
