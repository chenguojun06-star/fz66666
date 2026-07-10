package com.fashion.supplychain.style.helper;

import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.production.service.helper.MaterialPurchaseHelper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class StyleBomPurchaseHelper {

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private PatternProductionService patternProductionService;

    @Transactional(rollbackFor = Exception.class)
    public int generatePurchase(Long styleId) {
        return generatePurchase(styleId, false);
    }

    @Transactional(rollbackFor = Exception.class)
    public int generatePurchase(Long styleId, boolean force) {
        if (styleId == null || styleId <= 0) {
            throw new IllegalArgumentException("款式ID不能为空");
        }

        StyleInfo styleInfo = styleInfoService.getById(styleId);
        if (styleInfo == null) {
            throw new NoSuchElementException("款式不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(styleInfo.getTenantId(), "款式");

        List<StyleBom> bomList = styleBomService.listByStyleId(styleId);
        if (bomList == null || bomList.isEmpty()) {
            throw new IllegalStateException("该款式尚未配置BOM");
        }

        softDeleteExistingSamplePurchases(styleId, force);

        // 查询该款式的样板生产记录，获取 patternProductionId
        String patternProductionId = null;
        List<PatternProduction> patternRecords = patternProductionService.lambdaQuery()
                .eq(PatternProduction::getStyleId, String.valueOf(styleId))
                .eq(PatternProduction::getDeleteFlag, 0)
                .orderByDesc(PatternProduction::getCreateTime)
                .last("LIMIT 1")
                .list();
        if (patternRecords != null && !patternRecords.isEmpty()) {
            patternProductionId = patternRecords.get(0).getId();
            log.info("样衣采购关联样板生产记录: styleId={}, patternProductionId={}", styleId, patternProductionId);
        } else {
            log.warn("未找到样板生产记录，样衣采购将无 patternProductionId: styleId={}", styleId);
        }

        SizeColorParseResult parseResult = parseSizeColorConfig(styleInfo);
        log.info("样衣采购参数: styleId={}, 颜色={}, 尺码={}, 款式总件数={}",
                styleId, parseResult.colorStr, parseResult.sizeStr, parseResult.styleTotalQty);

        List<String> orderColors = parseResult.colorList;
        boolean orderHasMultipleColors = orderColors.size() > 1;

        int createdCount = 0;
        for (StyleBom bom : bomList) {
            try {
                String bomColorRaw = bom.getColor() == null ? "" : bom.getColor().trim();
                List<String> bomColorOpts = MaterialPurchaseHelper.splitOptions(bomColorRaw);
                Set<String> bomColorSet = bomColorOpts.isEmpty() ? null : new HashSet<>(bomColorOpts);

                if (!orderHasMultipleColors) {
                    String displayColor = bomColorRaw.isEmpty() ? parseResult.colorStr : bomColorRaw;
                    MaterialPurchase purchase = buildPurchaseFromBom(bom, styleInfo, parseResult,
                            displayColor, parseResult.sizeStr, patternProductionId);
                    if (purchase == null) continue;
                    materialPurchaseService.save(purchase);
                    createdCount++;
                } else {
                    Set<String> targetColors = bomColorSet != null ? bomColorSet : new HashSet<>(orderColors);
                    for (String orderColor : orderColors) {
                        String normalizedOrderColor = MaterialPurchaseHelper.normalizeMatchKey(orderColor);
                        boolean matches = targetColors.stream()
                                .anyMatch(bc -> MaterialPurchaseHelper.normalizeMatchKey(bc).equals(normalizedOrderColor));
                        if (!matches) continue;
                        MaterialPurchase purchase = buildPurchaseFromBom(bom, styleInfo, parseResult,
                                orderColor, parseResult.sizeStr, patternProductionId);
                        if (purchase == null) continue;
                        materialPurchaseService.save(purchase);
                        createdCount++;
                    }
                }
            } catch (Exception e) {
                log.error("Failed to create material purchase for bom: bomId={}", bom.getId(), e);
            }
        }

        log.info("Generated {} material purchase records for styleId={}", createdCount, styleId);
        return createdCount;
    }

    private void softDeleteExistingSamplePurchases(Long styleId, boolean force) {
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialPurchase> existsWrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        existsWrapper.eq(MaterialPurchase::getStyleId, String.valueOf(styleId))
                .eq(MaterialPurchase::getSourceType, "sample")
                .eq(MaterialPurchase::getDeleteFlag, 0);
        long existsCount = materialPurchaseService.count(existsWrapper);

        if (existsCount > 0) {
            if (!force) {
                throw new IllegalStateException("该款式已生成过样衣采购记录，请勿重复生成");
            }
            List<MaterialPurchase> existingRecords = materialPurchaseService.list(existsWrapper);
            int softDeletedCount = 0;
            for (MaterialPurchase mp : existingRecords) {
                String status = mp.getStatus() == null ? "" : mp.getStatus().trim().toLowerCase();
                if (MaterialConstants.STATUS_PENDING.equals(status)) {
                    materialPurchaseService.removeById(mp.getId());
                    softDeletedCount++;
                } else {
                    log.warn("样衣采购记录已{}，无法删除，跳过重新生成: purchaseNo={}", status, mp.getPurchaseNo());
                }
            }
            log.info("强制重新生成：软删除 {} 条旧样衣采购记录: styleId={}", softDeletedCount, styleId);
        }
    }

    private record SizeColorParseResult(String colorStr, List<String> colorList, String sizeStr, int styleTotalQty) {}

    private SizeColorParseResult parseSizeColorConfig(StyleInfo styleInfo) {
        String colorStr = null;
        String sizeStr = null;
        int styleTotalQty = 0;

        String sizeColorConfig = styleInfo.getSizeColorConfig();
        if (StringUtils.hasText(sizeColorConfig)) {
            try {
                ObjectMapper om = new ObjectMapper();
                JsonNode root = om.readTree(sizeColorConfig);
                JsonNode colorsNode = root.get("colors");
                JsonNode sizesNode = root.get("sizes");
                JsonNode quantitiesNode = root.get("quantities");

                List<String> colors = new ArrayList<>();
                if (colorsNode != null && colorsNode.isArray()) {
                    for (JsonNode n : colorsNode) {
                        String c = n.asText("").trim();
                        if (!c.isEmpty()) colors.add(c);
                    }
                }
                List<String> sizes = new ArrayList<>();
                if (sizesNode != null && sizesNode.isArray()) {
                    for (JsonNode n : sizesNode) {
                        String s = n.asText("").trim();
                        if (!s.isEmpty()) sizes.add(s);
                    }
                }
                if (quantitiesNode != null && quantitiesNode.isArray()) {
                    for (JsonNode n : quantitiesNode) {
                        styleTotalQty += n.asInt(0);
                    }
                }

                if (!colors.isEmpty()) colorStr = String.join(",", colors);
                if (!sizes.isEmpty()) sizeStr = String.join(",", sizes);
            } catch (Exception e) {
                log.warn("解析 size_color_config 失败，降级为款式 color/size 字段: styleId={}, error={}",
                        styleInfo.getId(), e.getMessage());
            }
        }

        if (colorStr == null || colorStr.isEmpty()) {
            String fallbackColor = styleInfo.getColor();
            if (fallbackColor != null && !fallbackColor.trim().isEmpty()) {
                colorStr = fallbackColor.trim();
            }
        }
        if (sizeStr == null || sizeStr.isEmpty()) {
            String fallbackSize = styleInfo.getSize();
            if (fallbackSize != null && !fallbackSize.trim().isEmpty()) {
                sizeStr = fallbackSize.trim();
            }
        }

        if (styleTotalQty <= 0) {
            styleTotalQty = 1;
            log.warn("款式颜色尺码数量配置未设置，采购数量将按BOM单件用量计算: styleId={}", styleInfo.getId());
        }

        List<String> colorList = new ArrayList<>();
        if (colorStr != null && !colorStr.isEmpty()) {
            for (String c : colorStr.split("[,/，、]+")) {
                String trimmed = c.trim();
                if (!trimmed.isEmpty()) colorList.add(trimmed);
            }
        }

        return new SizeColorParseResult(colorStr, colorList, sizeStr, styleTotalQty);
    }

    private MaterialPurchase buildPurchaseFromBom(StyleBom bom, StyleInfo styleInfo,
            SizeColorParseResult parseResult, String purchaseColor, String purchaseSize,
            String patternProductionId) {
        BigDecimal usageAmount = bom.getDevUsageAmount() != null ? bom.getDevUsageAmount()
                : (bom.getUsageAmount() != null ? bom.getUsageAmount() : BigDecimal.ZERO);
        BigDecimal lossRate = bom.getLossRate() != null ? bom.getLossRate() : BigDecimal.ZERO;
        BigDecimal lossFactor = BigDecimal.ONE.add(lossRate.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP));
        BigDecimal totalUsage = usageAmount.multiply(BigDecimal.valueOf(parseResult.styleTotalQty)).multiply(lossFactor);
        BigDecimal purchaseQty = totalUsage.setScale(4, RoundingMode.HALF_UP);

        if (purchaseQty.compareTo(BigDecimal.ZERO) <= 0) {
            log.warn("BOM配置用量为0或未设置，跳过该物料: styleId={}, materialName={}",
                    styleInfo.getId(), bom.getMaterialName());
            return null;
        }

        MaterialPurchase purchase = new MaterialPurchase();
        purchase.setPurchaseNo("MP" + System.currentTimeMillis() % 100000000);
        purchase.setMaterialCode(bom.getMaterialCode());
        purchase.setMaterialName(bom.getMaterialName());
        purchase.setMaterialType(bom.getMaterialType());
        purchase.setSpecifications(bom.getSpecification());
        purchase.setUnit(bom.getUnit());
        purchase.setConversionRate(bom.getConversionRate());
        purchase.setPurchaseQuantity(purchaseQty);
        purchase.setArrivedQuantity(0);

        String supplier = bom.getSupplier();
        if (supplier == null || supplier.trim().isEmpty()) {
            log.warn("BOM配置缺少供应商信息: styleId={}, materialName={}", styleInfo.getId(), bom.getMaterialName());
        }
        purchase.setSupplierName(supplier != null ? supplier.trim() : "");

        BigDecimal bomUnitPrice = bom.getUnitPrice();
        purchase.setUnitPrice(bomUnitPrice);
        purchase.setTotalAmount(bomUnitPrice != null ? bomUnitPrice.multiply(purchaseQty) : BigDecimal.ZERO);

        purchase.setStyleId(String.valueOf(styleInfo.getId()));
        purchase.setStyleNo(styleInfo.getStyleNo());
        purchase.setStyleName(styleInfo.getStyleName());
        purchase.setStyleCover(styleInfo.getCover());

        if (purchaseColor != null && !purchaseColor.isEmpty()) {
            purchase.setColor(purchaseColor);
        }
        if (purchaseSize != null && !purchaseSize.isEmpty()) {
            purchase.setSize(purchaseSize);
        }

        purchase.setSourceType("sample");
        purchase.setPatternProductionId(patternProductionId);
        purchase.setStatus(MaterialConstants.STATUS_PENDING);
        purchase.setDeleteFlag(0);
        purchase.setCreateTime(LocalDateTime.now());
        purchase.setUpdateTime(LocalDateTime.now());

        return purchase;
    }

    /**
     * BOM数量变更时，同步更新关联的pending采购任务
     * - sample类型：重新计算purchaseQuantity（复用buildPurchaseFromBom逻辑）
     * - order类型：软删除pending任务（计算依赖订单信息，需用户重新生成）
     *
     * @param oldBom 变更前的BOM
     * @param newBom 变更后的BOM
     * @return 同步的采购任务数量
     */
    public int syncPendingPurchasesOnBomChange(StyleBom oldBom, StyleBom newBom) {
        if (oldBom == null || newBom == null || newBom.getStyleId() == null) {
            return 0;
        }
        if (!isQuantityChanged(oldBom, newBom)) {
            return 0;
        }

        String styleIdStr = String.valueOf(newBom.getStyleId());
        String materialCode = newBom.getMaterialCode();

        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialPurchase> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(MaterialPurchase::getStyleId, styleIdStr)
               .eq(MaterialPurchase::getDeleteFlag, 0)
               .eq(MaterialPurchase::getStatus, MaterialConstants.STATUS_PENDING);
        if (StringUtils.hasText(materialCode)) {
            wrapper.eq(MaterialPurchase::getMaterialCode, materialCode);
        }

        List<MaterialPurchase> pendingPurchases = materialPurchaseService.list(wrapper);
        if (pendingPurchases.isEmpty()) {
            return 0;
        }

        int synced = 0;
        for (MaterialPurchase mp : pendingPurchases) {
            String sourceType = mp.getSourceType() == null ? "" : mp.getSourceType().trim();
            if ("sample".equals(sourceType)) {
                synced += recalcSamplePurchase(mp, newBom);
            } else if ("order".equals(sourceType)) {
                materialPurchaseService.removeById(mp.getId());
                synced++;
                log.info("BOM变更同步：软删除order类型pending采购任务 purchaseId={}, styleId={}", mp.getId(), styleIdStr);
            }
        }

        if (synced > 0) {
            log.info("BOM变更同步采购任务完成: styleId={}, materialCode={}, synced={}", styleIdStr, materialCode, synced);
        }
        return synced;
    }

    /**
     * 重新计算sample类型采购任务的数量
     */
    private int recalcSamplePurchase(MaterialPurchase mp, StyleBom newBom) {
        try {
            StyleInfo styleInfo = styleInfoService.getById(newBom.getStyleId());
            if (styleInfo == null) return 0;

            SizeColorParseResult parseResult = parseSizeColorConfig(styleInfo);
            BigDecimal usageAmount = newBom.getDevUsageAmount() != null ? newBom.getDevUsageAmount()
                    : (newBom.getUsageAmount() != null ? newBom.getUsageAmount() : BigDecimal.ZERO);
            BigDecimal lossRate = newBom.getLossRate() != null ? newBom.getLossRate() : BigDecimal.ZERO;
            BigDecimal lossFactor = BigDecimal.ONE.add(
                    lossRate.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP));
            BigDecimal totalUsage = usageAmount
                    .multiply(BigDecimal.valueOf(parseResult.styleTotalQty))
                    .multiply(lossFactor);
            BigDecimal purchaseQty = totalUsage.setScale(4, RoundingMode.HALF_UP);

            if (purchaseQty.compareTo(BigDecimal.ZERO) <= 0) return 0;

            mp.setPurchaseQuantity(purchaseQty);
            if (mp.getUnitPrice() != null) {
                mp.setTotalAmount(mp.getUnitPrice().multiply(purchaseQty).setScale(2, RoundingMode.HALF_UP));
            }
            mp.setUpdateTime(LocalDateTime.now());
            materialPurchaseService.updateById(mp);
            log.info("BOM变更同步：更新sample采购任务数量 purchaseId={}, newQty={}", mp.getId(), purchaseQty);
            return 1;
        } catch (Exception e) {
            log.warn("BOM变更同步sample采购任务失败: purchaseId={}, error={}", mp.getId(), e.getMessage());
            return 0;
        }
    }

    private boolean isQuantityChanged(StyleBom oldBom, StyleBom newBom) {
        return !bigDecimalEquals(oldBom.getUsageAmount(), newBom.getUsageAmount())
                || !bigDecimalEquals(oldBom.getDevUsageAmount(), newBom.getDevUsageAmount())
                || !bigDecimalEquals(oldBom.getLossRate(), newBom.getLossRate())
                || !stringEquals(oldBom.getSizeUsageMap(), newBom.getSizeUsageMap());
    }

    private boolean bigDecimalEquals(BigDecimal a, BigDecimal b) {
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        return a.compareTo(b) == 0;
    }

    private boolean stringEquals(String a, String b) {
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        return a.equals(b);
    }
}
