package com.fashion.supplychain.style.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.mapper.ProductSkuMapper;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Slf4j
public class ProductSkuOrchestrator {

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private StyleInfoMapper styleInfoMapper;

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ProductSkuMapper productSkuMapper;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    public List<ProductSku> listByStyleId(Long styleId) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        Long tenantId = UserContext.tenantId();
        List<ProductSku> skus = productSkuService.lambdaQuery()
                .eq(ProductSku::getStyleId, styleId)
                .eq(ProductSku::getTenantId, tenantId)
                .list();
        if (skus.isEmpty()) {
            tryAutoGenerateOnEmptyList(styleId);
            skus = productSkuService.lambdaQuery()
                    .eq(ProductSku::getStyleId, styleId)
                    .eq(ProductSku::getTenantId, tenantId)
                    .list();
        }
        return skus;
    }

    /** 单次批量解析上限：列表页一页通常 20~100 行，500 足够且能防住恶意大请求 */
    private static final int BRIEF_MAX_CODES = 500;

    /**
     * 批量解析 SKU 摘要（款号 / 颜色 / 尺码 / 图片 / 价格），供电商各列表的「款式图」「款号」列使用。
     *
     * <p><b>为什么必须由后端解析，而不是前端从 skuCode 里切字符串：</b>
     * 真实 SKU 编码是「<b>款号直接拼颜色尺码、没有分隔符</b>」，
     * 例如 {@code BR24XQ0098E草绿色L(170/84A)}（款号 {@code BR24XQ0098E}）。
     * 前端任何 {@code split('-')[0]} / {@code indexOf('-')} 都恒不命中，
     * 表现就是「款号列显示整串编码、款式图列永远空白」——这正是电商列表"看不出是什么订单"的根因。
     * 此处以 {@code t_product_sku} 为权威口径（sku_code → style_id / style_no / color / sku_color_image），
     * 款图用 {@code t_style_info.cover} 兜底。
     *
     * @param skuCodes 待解析的商品编码，可含 null/空串（会被过滤），去重后最多 {@value #BRIEF_MAX_CODES} 个
     * @return skuCode → { skuCode, skuId, styleId, styleNo, color, size, imageUrl, salesPrice, costPrice }
     *         查不到的编码不会出现在结果里（**不编造默认值**，前端据此显示占位）
     */
    public Map<String, Map<String, Object>> briefBySkuCodes(Collection<String> skuCodes) {
        if (skuCodes == null || skuCodes.isEmpty()) {
            return Map.of();
        }
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalArgumentException("缺少租户上下文，无法解析 SKU 摘要");
        }
        List<String> codes = skuCodes.stream()
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .limit(BRIEF_MAX_CODES)
                .collect(Collectors.toList());
        if (codes.isEmpty()) {
            return Map.of();
        }

        List<ProductSku> skus = productSkuService.lambdaQuery()
                .eq(ProductSku::getTenantId, tenantId)
                .in(ProductSku::getSkuCode, codes)
                .list();
        if (skus.isEmpty()) {
            return Map.of();
        }

        // 款图兜底：SKU 没有颜色图时用款级封面
        Set<Long> styleIds = skus.stream()
                .map(ProductSku::getStyleId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, StyleInfo> styleById = styleIds.isEmpty()
                ? Map.of()
                : styleInfoService.listByIds(styleIds).stream()
                        .collect(Collectors.toMap(StyleInfo::getId, s -> s, (a, b) -> a));

        Map<String, Map<String, Object>> result = new HashMap<>();
        for (ProductSku sku : skus) {
            StyleInfo style = sku.getStyleId() == null ? null : styleById.get(sku.getStyleId());
            Map<String, Object> brief = new HashMap<>();
            brief.put("skuCode", sku.getSkuCode());
            brief.put("skuId", sku.getId());
            brief.put("styleId", sku.getStyleId());
            brief.put("styleNo", StringUtils.hasText(sku.getStyleNo())
                    ? sku.getStyleNo()
                    : (style != null ? style.getStyleNo() : null));
            brief.put("color", sku.getColor());
            brief.put("size", sku.getSize());
            // 颜色图优先（订单买的正是这个颜色），没有则退回款图
            brief.put("imageUrl", StringUtils.hasText(sku.getSkuColorImage())
                    ? sku.getSkuColorImage()
                    : (style != null ? style.getCover() : null));
            brief.put("salesPrice", sku.getSalesPrice());
            brief.put("costPrice", sku.getCostPrice());
            result.put(sku.getSkuCode(), brief);
        }
        log.debug("[SkuBrief] 解析 {} 个编码，命中 {} 条", codes.size(), result.size());
        return result;
    }

    /**
     * 按 skuId 批量解析 SKU 摘要。
     *
     * <p>有些列表只存了 {@code sku_id}（例如智能定价建议），要显示款号/款式图就得先换出 skuCode。
     * 复用 {@link #briefBySkuCodes} 的口径，保证两处结果一致。
     *
     * @param skuIds 主键集合，null/空返回空 Map
     * @return skuId → 同 {@link #briefBySkuCodes} 的摘要结构
     */
    public Map<Long, Map<String, Object>> briefBySkuIds(Collection<Long> skuIds) {
        if (skuIds == null || skuIds.isEmpty()) {
            return Map.of();
        }
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalArgumentException("缺少租户上下文，无法解析 SKU 摘要");
        }
        List<Long> ids = skuIds.stream()
                .filter(java.util.Objects::nonNull)
                .distinct()
                .limit(BRIEF_MAX_CODES)
                .collect(Collectors.toList());
        if (ids.isEmpty()) {
            return Map.of();
        }
        List<ProductSku> skus = productSkuService.lambdaQuery()
                .eq(ProductSku::getTenantId, tenantId)
                .in(ProductSku::getId, ids)
                .list();
        if (skus.isEmpty()) {
            return Map.of();
        }
        Map<String, Map<String, Object>> byCode = briefBySkuCodes(
                skus.stream().map(ProductSku::getSkuCode).collect(Collectors.toList()));
        Map<Long, Map<String, Object>> byId = new HashMap<>();
        for (ProductSku sku : skus) {
            Map<String, Object> brief = byCode.get(sku.getSkuCode());
            if (brief != null) {
                byId.put(sku.getId(), brief);
            }
        }
        return byId;
    }

    private void tryAutoGenerateOnEmptyList(Long styleId) {
        try {
            StyleInfo style = styleInfoMapper.selectById(styleId);
            if (style == null) {
                return;
            }
            String mode = style.getSkuMode();
            if (mode == null) {
                mode = "AUTO";
            }
            if (!"AUTO".equals(mode)) {
                return;
            }
            if (!StringUtils.hasText(style.getSizeColorConfig())) {
                return;
            }
            productSkuService.generateSkusForStyle(styleId);
            log.info("Auto-generated SKUs on first load: styleId={}", styleId);
        } catch (Exception e) {
            log.warn("Failed to auto-generate SKUs on first load: styleId={}", styleId, e);
        }
    }

    /**
     * D-212：把 sizeColorConfig 中"已无任何 SKU"的码数移除（新格式 {colors,sizes,matrixRows}）。
     * matrixRows.quantities 与 sizes 按索引对齐，删码时同步删各颜色行的数量位。
     */
    private void syncRemoveSizesFromConfig(StyleInfo style, Long styleId, Long tenantId) {
        try {
            String configJson = style.getSizeColorConfig();
            if (!org.springframework.util.StringUtils.hasText(configJson)
                    || configJson.trim().startsWith("[")) {
                return; // 旧格式（颜色分组数组）结构不同，跳过
            }
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            java.util.Map<String, Object> config = mapper.readValue(configJson,
                    new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {
                    });
            List<String> configSizes = new java.util.ArrayList<>();
            Object sizesObj = config.get("sizes");
            if (sizesObj instanceof List) {
                for (Object o : (List<?>) sizesObj) {
                    if (o != null) configSizes.add(String.valueOf(o).trim());
                }
            }
            if (configSizes.isEmpty()) {
                return;
            }
            // 剩余 SKU 的码数集合（删除后查询）
            java.util.Set<String> remainingSizes = new java.util.HashSet<>();
            for (ProductSku sku : productSkuService.lambdaQuery()
                    .eq(ProductSku::getStyleId, styleId)
                    .eq(ProductSku::getTenantId, tenantId)
                    .list()) {
                if (org.springframework.util.StringUtils.hasText(sku.getSize())) {
                    remainingSizes.add(sku.getSize().trim());
                }
            }
            List<Integer> removeIdx = new java.util.ArrayList<>();
            for (int i = 0; i < configSizes.size(); i++) {
                if (!remainingSizes.contains(configSizes.get(i))) {
                    removeIdx.add(i);
                }
            }
            if (removeIdx.isEmpty()) {
                return;
            }
            List<String> newSizes = new java.util.ArrayList<>();
            for (int i = 0; i < configSizes.size(); i++) {
                if (!removeIdx.contains(i)) {
                    newSizes.add(configSizes.get(i));
                }
            }
            config.put("sizes", newSizes);
            // matrixRows.quantities 同步删位
            Object matrixObj = config.get("matrixRows");
            if (matrixObj instanceof List) {
                for (Object rowObj : (List<?>) matrixObj) {
                    if (rowObj instanceof Map) {
                        Object qtyObj = ((Map<?, ?>) rowObj).get("quantities");
                        if (qtyObj instanceof List) {
                            List<?> qty = (List<?>) qtyObj;
                            List<Object> newQty = new java.util.ArrayList<>();
                            for (int i = 0; i < qty.size(); i++) {
                                if (!removeIdx.contains(i)) {
                                    newQty.add(qty.get(i));
                                }
                            }
                            ((java.util.Map<String, Object>) rowObj).put("quantities", newQty);
                        }
                    }
                }
            }
            styleInfoService.updateSizeColorConfigOnly(styleId, mapper.writeValueAsString(config));
        } catch (Exception e) {
            // 联动失败不阻断删除主流程
            log.warn("syncRemoveSizesFromConfig failed: styleId={}, err={}", styleId, e.getMessage());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void batchUpdateSkus(Long styleId, List<ProductSku> skuList, List<Long> deletedIds) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        Long tenantId = UserContext.tenantId();
        StyleInfo style = styleInfoMapper.selectOne(new LambdaQueryWrapper<StyleInfo>()
                .eq(StyleInfo::getId, styleId)
                .eq(StyleInfo::getTenantId, tenantId));
        if (style == null) {
            throw new IllegalArgumentException("款式不存在: " + styleId);
        }

        if (deletedIds != null && !deletedIds.isEmpty()) {
            // 批量查询待删除的 SKU（保留 tenantId 过滤，P0 #4 多租户隔离）
            List<ProductSku> toDelete = productSkuService.lambdaQuery()
                    .in(ProductSku::getId, deletedIds)
                    .eq(ProductSku::getTenantId, tenantId)
                    .list();
            // 保留 styleId 过滤
            List<ProductSku> removable = toDelete.stream()
                    .filter(sku -> styleId.equals(sku.getStyleId()))
                    .collect(Collectors.toList());
            if (!removable.isEmpty()) {
                List<Long> idsToRemove = removable.stream()
                        .map(ProductSku::getId)
                        .collect(Collectors.toList());
                productSkuService.removeByIds(idsToRemove);
                for (ProductSku sku : removable) {
                    log.info("Deleted SKU id={}, skuCode={}", sku.getId(), sku.getSkuCode());
                }
            }
        }

        // D-212：删除 SKU 行后，同步把"已无任何 SKU"的码数从 sizeColorConfig 中移除——
        // 否则下次配置保存时 generateSkusForStyle 会按旧 config 把删除的行重建回来（"删了又复活"根因）
        if (deletedIds != null && !deletedIds.isEmpty()) {
            syncRemoveSizesFromConfig(style, styleId, tenantId);
        }

        if (skuList != null && !skuList.isEmpty()) {
            productSkuService.batchUpdateSkus(styleId, skuList);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateSkuMode(Long styleId, String skuMode) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        if (!"AUTO".equals(skuMode) && !"MANUAL".equals(skuMode)) {
            throw new IllegalArgumentException("skuMode must be AUTO or MANUAL");
        }
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        StyleInfo style = styleInfoMapper.selectOne(new LambdaQueryWrapper<StyleInfo>()
                .eq(StyleInfo::getId, styleId)
                .eq(StyleInfo::getTenantId, tenantId));
        if (style == null) {
            throw new IllegalArgumentException("款式不存在: " + styleId);
        }
        productSkuService.updateSkuMode(styleId, skuMode);
        if ("AUTO".equals(skuMode)) {
            productSkuService.syncSkusToProduction(styleId);
            log.info("Auto-synced SKUs to production after switching to AUTO mode: styleId={}", styleId);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void syncSkusToProduction(Long styleId) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        TenantAssert.assertTenantContext();
        productSkuService.syncSkusToProduction(styleId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void syncSkus(Long styleId) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        TenantAssert.assertTenantContext();
        productSkuService.generateSkusForStyle(styleId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateSkc(Long styleId, String newSkc) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        if (!StringUtils.hasText(newSkc)) {
            throw new IllegalArgumentException("SKC不能为空");
        }
        Long tenantId = UserContext.tenantId();
        StyleInfo style = styleInfoMapper.selectOne(new LambdaQueryWrapper<StyleInfo>()
                .eq(StyleInfo::getId, styleId)
                .eq(StyleInfo::getTenantId, tenantId));
        if (style == null) {
            throw new IllegalArgumentException("款式不存在: " + styleId);
        }

        String oldSkc = style.getSkc();
        if (newSkc.equals(oldSkc)) {
            return;
        }

        style.setSkc(newSkc.trim());
        styleInfoMapper.updateById(style);
        log.info("Updated SKC for styleId={}: {} -> {}", styleId, oldSkc, newSkc);

        int syncCount = productionOrderMapper.update(null,
                new LambdaUpdateWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getStyleNo, style.getStyleNo())
                        .eq(ProductionOrder::getTenantId, style.getTenantId())
                        .ne(ProductionOrder::getSkc, newSkc.trim())
                        .set(ProductionOrder::getSkc, newSkc.trim()));
        if (syncCount > 0) {
            log.info("Synced SKC to {} production orders for styleNo={}", syncCount, style.getStyleNo());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void saveRollbackRemark(Long styleId, String remark) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        StyleInfo style = styleInfoMapper.selectById(styleId);
        if (style == null) {
            throw new IllegalArgumentException("款式不存在: " + styleId);
        }
        if (!StringUtils.hasText(remark)) {
            return;
        }
        Long tenantId = UserContext.tenantId();
        int rows = productSkuMapper.update(null,
                new LambdaUpdateWrapper<ProductSku>()
                        .eq(ProductSku::getStyleId, styleId)
                        .eq(tenantId != null, ProductSku::getTenantId, tenantId)
                        .set(ProductSku::getRemark, remark.trim()));
        log.info("Saved rollback remark for styleId={}, affected {} SKUs", styleId, rows);
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateStock(String skuCode, int quantity) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        ProductSku existing = productSkuService.lambdaQuery()
                .eq(ProductSku::getSkuCode, skuCode)
                .eq(ProductSku::getTenantId, tenantId)
                .one();
        if (existing == null) {
            throw new IllegalArgumentException("SKU不存在: " + skuCode);
        }
        productSkuService.updateStock(skuCode, quantity);
    }

    /**
     * 批量更新SKU颜色图片（按款号+颜色匹配）
     * @param styleId 款式ID
     * @param colorImageMap Map<颜色, 图片URL>
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateSkuColorImages(Long styleId, java.util.Map<String, String> colorImageMap) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        if (colorImageMap == null || colorImageMap.isEmpty()) {
            return;
        }
        StyleInfo style = styleInfoMapper.selectById(styleId);
        if (style == null) {
            throw new IllegalArgumentException("款式不存在: " + styleId);
        }
        Long tenantId = UserContext.tenantId();
        int updatedCount = 0;
        for (java.util.Map.Entry<String, String> entry : colorImageMap.entrySet()) {
            String color = entry.getKey();
            String imageUrl = entry.getValue();
            if (!StringUtils.hasText(color)) {
                continue;
            }
            int rows = productSkuMapper.update(null,
                    new LambdaUpdateWrapper<ProductSku>()
                            .eq(ProductSku::getStyleId, styleId)
                            .eq(tenantId != null, ProductSku::getTenantId, tenantId)
                            .eq(ProductSku::getColor, color.trim())
                            .set(StringUtils.hasText(imageUrl), ProductSku::getSkuColorImage, imageUrl.trim())
                            .set(!StringUtils.hasText(imageUrl), ProductSku::getSkuColorImage, (String) null));
            updatedCount += rows;
        }
        log.info("Updated SKU color images for styleId={}, updated {} SKUs", styleId, updatedCount);
    }

    /**
     * 重新计算所有SKU的库存（根据入库单汇总进行修正）
     *
     * <p>返回包含 totalSkus、fixed、unchanged 和 details 的 Map，便于调用方统计。
     *
     * @return 修正结果汇总
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> recalculateSkuStock() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<ProductSku> allSkus = productSkuService.lambdaQuery()
                .eq(ProductSku::getTenantId, tenantId)
                .last("LIMIT 5000")
                .list();
        int fixed = 0;
        int unchanged = 0;
        List<Map<String, Object>> details = new ArrayList<>();

        // 批量预加载所有相关入库记录（修复 N+1 查询）：按 styleNo IN 一次查询
        Set<String> styleNos = allSkus.stream()
                .map(ProductSku::getStyleNo)
                .filter(s -> s != null && !s.isEmpty())
                .collect(Collectors.toSet());
        Map<String, List<ProductWarehousing>> recordMap = new HashMap<>();
        if (!styleNos.isEmpty()) {
            List<ProductWarehousing> allRecords = productWarehousingService.lambdaQuery()
                    .in(ProductWarehousing::getStyleNo, styleNos)
                    .eq(ProductWarehousing::getDeleteFlag, 0)
                    .eq(ProductWarehousing::getTenantId, tenantId)
                    .list();
            recordMap = allRecords.stream()
                    .collect(Collectors.groupingBy(
                            r -> r.getStyleNo() + "|" + r.getColor() + "|" + r.getSize()));
        }

        List<ProductSku> toUpdate = new ArrayList<>();
        for (ProductSku sku : allSkus) {
            int inboundTotal = 0;
            // 原始查询用 .eq(field, null) 返回 0 行（SQL 中 NULL != NULL），此处保持一致
            if (sku.getStyleNo() != null && sku.getColor() != null && sku.getSize() != null) {
                String key = sku.getStyleNo() + "|" + sku.getColor() + "|" + sku.getSize();
                List<ProductWarehousing> inboundRecords = recordMap.get(key);
                if (inboundRecords != null) {
                    for (ProductWarehousing pw : inboundRecords) {
                        if (pw.getQualifiedQuantity() != null && pw.getQualifiedQuantity() > 0) {
                            inboundTotal += pw.getQualifiedQuantity();
                        }
                    }
                }
            }

            int oldStock = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
            if (oldStock != inboundTotal) {
                sku.setStockQuantity(inboundTotal);
                toUpdate.add(sku);
                fixed++;
                Map<String, Object> d = new HashMap<>();
                d.put("skuCode", sku.getSkuCode());
                d.put("styleNo", sku.getStyleNo());
                d.put("color", sku.getColor());
                d.put("size", sku.getSize());
                d.put("oldStock", oldStock);
                d.put("newStock", inboundTotal);
                details.add(d);
                log.info("[ProductSkuOrchestrator] SKU库存修正: {} {} {} {} {} -> {}",
                        sku.getSkuCode(), sku.getStyleNo(), sku.getColor(), sku.getSize(),
                        oldStock, inboundTotal);
            } else {
                unchanged++;
            }
        }

        // 批量更新（修复 N+1 更新）
        if (!toUpdate.isEmpty()) {
            productSkuService.updateBatchById(toUpdate);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("totalSkus", allSkus.size());
        result.put("fixed", fixed);
        result.put("unchanged", unchanged);
        result.put("details", details);
        log.info("[ProductSkuOrchestrator] SKU库存重新计算完成：共{}个SKU，修正{}个，未变{}个",
                allSkus.size(), fixed, unchanged);
        return result;
    }
}
