package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.ProductSkuMapper;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class ProductSkuServiceImpl extends ServiceImpl<ProductSkuMapper, ProductSku> implements ProductSkuService {

    private final StyleInfoMapper styleInfoMapper;
    private final ProductionOrderMapper productionOrderMapper;
    private final ObjectMapper objectMapper;

    @Override
    public void generateSkusForStyle(Long styleId) {
        StyleInfo style = styleInfoMapper.selectById(styleId);
        if (style == null) {
            return;
        }

        String sizeColorConfig = style.getSizeColorConfig();
        if (!StringUtils.hasText(sizeColorConfig)) {
            return;
        }

        try {
            List<String> sizes;
            List<String> colors;

            String trimmed = sizeColorConfig.trim();
            Map<String, Object> config = null;
            if (trimmed.startsWith("[")) {
                // 旧格式：[{color, sizes: [...]}, ...]
                List<Map<String, Object>> configList = objectMapper.readValue(trimmed,
                        new TypeReference<List<Map<String, Object>>>() {
                        });
                colors = new java.util.ArrayList<>();
                sizes = new java.util.ArrayList<>();
                for (Map<String, Object> colorGroup : configList) {
                    String color = (String) colorGroup.get("color");
                    if (StringUtils.hasText(color)) {
                        colors.add(color.trim());
                    }
                    Object sizesObj = colorGroup.get("sizes");
                    if (sizesObj instanceof List) {
                        for (Object sizeItem : (List<?>) sizesObj) {
                            if (sizeItem instanceof Map) {
                                String size = (String) ((Map<?, ?>) sizeItem).get("size");
                                if (StringUtils.hasText(size) && !sizes.contains(size.trim())) {
                                    sizes.add(size.trim());
                                }
                            } else if (sizeItem instanceof String && StringUtils.hasText((String) sizeItem)) {
                                String s = ((String) sizeItem).trim();
                                if (!sizes.contains(s)) {
                                    sizes.add(s);
                                }
                            }
                        }
                    }
                }
            } else {
                // 新格式：{colors, sizes, matrixRows}
                config = objectMapper.readValue(trimmed,
                        new TypeReference<Map<String, Object>>() {
                        });

                sizes = extractStringList(config, "sizes");
                colors = extractStringList(config, "colors");

                if (colors.isEmpty()) {
                    Object matrixRows = config.get("matrixRows");
                    if (matrixRows instanceof List) {
                        for (Object row : (List<?>) matrixRows) {
                            if (row instanceof Map) {
                                String color = (String) ((Map<?, ?>) row).get("color");
                                if (StringUtils.hasText(color)) {
                                    colors.add(color.trim());
                                }
                            }
                        }
                    }
                }
            }

            if (sizes.isEmpty() || colors.isEmpty()) {
                log.info("SKU generation skipped: no sizes or colors configured for styleId={}", styleId);
                return;
            }

            // 从 matrixRows 提取每个颜色每种尺码的数量
            // matrixRows[i].quantities[j] 对应 sizes[j]（按位置索引）
            java.util.Map<String, java.util.Map<String, Integer>> colorSizeQtyMap = new java.util.LinkedHashMap<>();
            if (config != null) {
                Object matrixRows = config.get("matrixRows");
                if (matrixRows instanceof List) {
                    for (Object row : (List<?>) matrixRows) {
                        if (row instanceof Map) {
                            String color = (String) ((Map<?, ?>) row).get("color");
                            if (!StringUtils.hasText(color)) continue;
                            Object qtyObj = ((Map<?, ?>) row).get("quantities");
                            if (qtyObj instanceof List) {
                                List<?> qtyList = (List<?>) qtyObj;
                                java.util.Map<String, Integer> sizeQtyMap = new java.util.LinkedHashMap<>();
                                for (int j = 0; j < sizes.size() && j < qtyList.size(); j++) {
                                    Object q = qtyList.get(j);
                                    int qty = 0;
                                    if (q instanceof Number) {
                                        qty = ((Number) q).intValue();
                                    }
                                    sizeQtyMap.put(sizes.get(j), qty);
                                }
                                colorSizeQtyMap.put(color.trim(), sizeQtyMap);
                            }
                        }
                    }
                }
            }

            for (String color : colors) {
                for (String size : sizes) {
                    // 从 matrixRows 取数量，没有则取矩阵该颜色该尺码的总数（兼容旧数据）
                    Integer qty = null;
                    if (colorSizeQtyMap.containsKey(color) && colorSizeQtyMap.get(color).containsKey(size)) {
                        qty = colorSizeQtyMap.get(color).get(size);
                    }
                    // 兼容：若 matrixRows 没有该颜色记录，取该颜色所有尺码的总数量
                    if (qty == null && colorSizeQtyMap.containsKey(color)) {
                        qty = colorSizeQtyMap.get(color).values().stream().mapToInt(Integer::intValue).sum();
                    }
                    createOrUpdateSku(style, color, size, qty);
                }
            }
        } catch (Exception e) {
            log.error("Failed to generate SKUs for style: " + styleId, e);
        }
    }

    private List<String> extractStringList(Map<String, Object> config, String key) {
        List<String> result = new java.util.ArrayList<>();
        Object value = config.get(key);
        if (value instanceof List) {
            for (Object item : (List<?>) value) {
                if (item instanceof String && StringUtils.hasText((String) item)) {
                    result.add(((String) item).trim());
                } else if (item instanceof Map) {
                    Object sizeVal = ((Map<?, ?>) item).get("size");
                    if (sizeVal instanceof String && StringUtils.hasText((String) sizeVal)) {
                        result.add(((String) sizeVal).trim());
                    }
                }
            }
        }
        return result;
    }

    @Override
    public void updateStock(String skuCode, int quantity) {
        if (!StringUtils.hasText(skuCode)) {
            return;
        }
        Long tenantId = UserContext.tenantId();
        int rows = baseMapper.updateStockBySkuCode(skuCode, quantity, tenantId);
        if (rows > 0) {
            log.info("Atomically updated stock for SKU {}: delta={}", skuCode, quantity);
            return;
        }
        if (quantity > 0) {
            try {
                String[] parts = skuCode.split("-", 3);
                if (parts.length >= 3) {
                    String styleNo = parts[0];
                    String color = parts[1];
                    String size = parts[2];

                    StyleInfo style = styleInfoMapper.selectOne(
                            new LambdaQueryWrapper<StyleInfo>()
                                    .eq(StyleInfo::getStyleNo, styleNo)
                                    .last("LIMIT 1"));

                    ProductSku newSku = new ProductSku();
                    newSku.setSkuCode(skuCode);
                    newSku.setStyleId(style != null ? style.getId() : 0L);
                    newSku.setStyleNo(styleNo);
                    newSku.setColor(color);
                    newSku.setSize(size);
                    newSku.setStatus("ENABLED");
                    newSku.setStockQuantity(quantity);
                    newSku.setTenantId(tenantId);
                    if (style != null && style.getPrice() != null) {
                        newSku.setSalesPrice(style.getPrice());
                    }
                    this.save(newSku);
                    log.info("Auto-created SKU {} with stock {} (from warehousing)", skuCode, quantity);
                } else {
                    log.warn("Invalid SKU code format for auto-create: {}", skuCode);
                }
            } catch (Exception e) {
                log.warn("Failed to auto-create SKU {}: {}", skuCode, e.getMessage());
            }
        } else {
            log.warn("SKU not found for stock update: {}", skuCode);
        }
    }

    @Override
    public void updateStockById(Long id, int delta) {
        if (delta == 0 || id == null) {
            return;
        }
        int rows = baseMapper.updateStockById(id, delta, UserContext.tenantId());
        if (rows == 0) {
            throw new IllegalStateException("SKU库存更新失败: id=" + id);
        }
        log.info("Updated SKU stock by id: id={}, delta={}", id, delta);
    }

    @Override
    public boolean decreaseStockBySkuCode(String skuCode, int delta) {
        if (delta <= 0 || !StringUtils.hasText(skuCode)) {
            return false;
        }
        int rows = baseMapper.decreaseStockBySkuCode(skuCode, delta, UserContext.tenantId());
        return rows > 0;
    }

    @Override
    public List<ProductSku> listByStyleId(Long styleId) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<ProductSku> wrapper = new LambdaQueryWrapper<ProductSku>()
                .eq(ProductSku::getStyleId, styleId)
                .orderByAsc(ProductSku::getColor, ProductSku::getSize);
        if (tenantId != null) {
            wrapper.eq(ProductSku::getTenantId, tenantId);
        }
        return this.list(wrapper);
    }

    @Override
    public void batchUpdateSkus(Long styleId, List<ProductSku> skuList) {
        if (skuList == null || skuList.isEmpty()) {
            return;
        }

        StyleInfo style = styleInfoMapper.selectById(styleId);
        if (style == null) {
            return;
        }

        Long tenantId = UserContext.tenantId();

        for (ProductSku skuUpdate : skuList) {
            if (skuUpdate.getId() != null) {
                ProductSku existing = this.getById(skuUpdate.getId());
                if (existing == null) {
                    continue;
                }
                if (tenantId != null && !tenantId.equals(existing.getTenantId())) {
                    log.warn("Tenant mismatch for SKU id={}, skipping", skuUpdate.getId());
                    continue;
                }
                if (Objects.equals(existing.getStyleId(), styleId)) {
                    existing.setSkuCode(skuUpdate.getSkuCode());
                    existing.setColor(skuUpdate.getColor());
                    existing.setSize(skuUpdate.getSize());
                    existing.setBarcode(skuUpdate.getBarcode());
                    existing.setExternalSkuId(skuUpdate.getExternalSkuId());
                    existing.setExternalPlatform(skuUpdate.getExternalPlatform());
                    existing.setCostPrice(skuUpdate.getCostPrice());
                    existing.setSalesPrice(skuUpdate.getSalesPrice());
                    existing.setStockQuantity(skuUpdate.getStockQuantity());
                    existing.setRemark(skuUpdate.getRemark());
                    existing.setManuallyEdited(1);
                    this.updateById(existing);
                }
            } else {
                if (!StringUtils.hasText(skuUpdate.getColor()) || !StringUtils.hasText(skuUpdate.getSize())) {
                    log.warn("Cannot create SKU without color and size: styleId={}", styleId);
                    continue;
                }

                String autoCode = generateSkuCode(style.getStyleNo(), skuUpdate.getColor(), skuUpdate.getSize(), style.getUseSkuPrefix());
                if (!StringUtils.hasText(skuUpdate.getSkuCode())) {
                    skuUpdate.setSkuCode(autoCode);
                }

                ProductSku existingByCode = this.getOne(new LambdaQueryWrapper<ProductSku>()
                        .eq(ProductSku::getSkuCode, skuUpdate.getSkuCode()));
                if (existingByCode != null) {
                    log.warn("SKU code already exists: {}, skip creation", skuUpdate.getSkuCode());
                    continue;
                }

                skuUpdate.setStyleId(styleId);
                skuUpdate.setStyleNo(style.getStyleNo());
                skuUpdate.setStatus("ENABLED");
                skuUpdate.setStockQuantity(skuUpdate.getStockQuantity() != null ? skuUpdate.getStockQuantity() : 0);
                skuUpdate.setManuallyEdited(1);
                skuUpdate.setSkuMode(style.getSkuMode());
                skuUpdate.setTenantId(tenantId);
                this.save(skuUpdate);
            }
        }

        // ★ 反向同步：SKU数量变化 → 回写 sizeColorConfig.matrixRows
        syncStockQuantityToMatrixRows(style, skuList);
    }

    /**
     * 将SKU的stockQuantity反向同步到sizeColorConfig.matrixRows
     * matrixRows[rowIndex].quantities[sizeIndex] 对应 colors[rowIndex] × sizes[sizeIndex]
     */
    private void syncStockQuantityToMatrixRows(StyleInfo style, List<ProductSku> skuList) {
        String configJson = style.getSizeColorConfig();
        if (!StringUtils.hasText(configJson) || skuList == null || skuList.isEmpty()) {
            return;
        }

        try {
            String trimmed = configJson.trim();
            Map<String, Object> config;
            List<String> colors;
            List<String> sizes;

            if (trimmed.startsWith("[")) {
                // 旧格式不支持反向同步
                return;
            }

            config = objectMapper.readValue(trimmed, new TypeReference<Map<String, Object>>() {});
            Object colorsObj = config.get("colors");
            Object sizesObj = config.get("sizes");
            Object matrixRowsObj = config.get("matrixRows");

            if (!(colorsObj instanceof List) || !(sizesObj instanceof List) || !(matrixRowsObj instanceof List)) {
                return;
            }

            colors = ((List<?>) colorsObj).stream().map(String::valueOf).collect(java.util.stream.Collectors.toList());
            sizes = ((List<?>) sizesObj).stream().map(String::valueOf).collect(java.util.stream.Collectors.toList());
            List<Map<String, Object>> matrixRows = (List<Map<String, Object>>) matrixRowsObj;

            // 构建 colorIndex 映射
            java.util.Map<String, Integer> colorIndexMap = new java.util.LinkedHashMap<>();
            for (int i = 0; i < colors.size(); i++) {
                colorIndexMap.put(colors.get(i).trim(), i);
            }

            // 遍历SKU，按 (color, size) 找到 matrixRows 对应位置并更新 quantities
            boolean modified = false;
            for (ProductSku sku : skuList) {
                String skuColor = sku.getColor();
                String skuSize = sku.getSize();
                if (!StringUtils.hasText(skuColor) || !StringUtils.hasText(skuSize)) {
                    continue;
                }
                Integer rowIdx = colorIndexMap.get(skuColor.trim());
                if (rowIdx == null) {
                    continue;
                }
                Integer colIdx = null;
                for (int j = 0; j < sizes.size(); j++) {
                    if (sizes.get(j).trim().equals(skuSize.trim())) {
                        colIdx = j;
                        break;
                    }
                }
                if (colIdx == null) {
                    continue;
                }

                Map<String, Object> row = matrixRows.get(rowIdx);
                Object qtyObj = row.get("quantities");
                if (qtyObj instanceof List) {
                    List<Object> quantities = (List<Object>) qtyObj;
                    if (colIdx < quantities.size()) {
                        Integer newQty = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
                        quantities.set(colIdx, newQty);
                        modified = true;
                    }
                }
            }

            if (modified) {
                config.put("matrixRows", matrixRows);
                style.setSizeColorConfig(objectMapper.writeValueAsString(config));
                styleInfoMapper.updateById(style);
            }
        } catch (Exception e) {
            log.error("反向同步SKU数量到matrixRows失败: styleId={}", style.getId(), e);
        }
    }

    @Override
    public void updateSkuMode(Long styleId, String skuMode) {
        StyleInfo style = styleInfoMapper.selectById(styleId);
        if (style == null) {
            return;
        }

        style.setSkuMode(skuMode);
        styleInfoMapper.updateById(style);

        if ("AUTO".equals(skuMode)) {
            generateSkusForStyle(styleId);
            List<ProductSku> skus = listByStyleId(styleId);
            List<ProductSku> toUpdate = skus.stream()
                    .filter(sku -> {
                        String autoCode = generateSkuCode(style.getStyleNo(), sku.getColor(), sku.getSize(), style.getUseSkuPrefix());
                        if (!autoCode.equals(sku.getSkuCode())) {
                            sku.setSkuCode(autoCode);
                            sku.setManuallyEdited(0);
                            return true;
                        }
                        return false;
                    })
                    .collect(Collectors.toList());
            if (!toUpdate.isEmpty()) {
                this.updateBatchById(toUpdate);
            }
        }
    }

    @Override
    public void syncSkusToProduction(Long styleId) {
        StyleInfo style = styleInfoMapper.selectById(styleId);
        if (style == null) {
            return;
        }

        List<ProductSku> skus = listByStyleId(styleId);
        if (skus.isEmpty()) {
            return;
        }

        Map<String, ProductSku> skuMap = skus.stream()
                .filter(s -> s.getColor() != null && s.getSize() != null)
                .collect(Collectors.toMap(
                        s -> s.getColor() + "|" + s.getSize(),
                        s -> s,
                        (a, b) -> a));

        List<ProductionOrder> orders = productionOrderMapper.selectList(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getStyleNo, style.getStyleNo())
                        .eq(ProductionOrder::getTenantId, style.getTenantId()));

        for (ProductionOrder order : orders) {
            try {
                String orderDetails = order.getOrderDetails();
                if (!StringUtils.hasText(orderDetails)) {
                    continue;
                }

                List<Map<String, Object>> detailList = objectMapper.readValue(orderDetails,
                        new TypeReference<List<Map<String, Object>>>() {
                        });

                boolean changed = false;
                for (Map<String, Object> detail : detailList) {
                    String detailColor = (String) detail.get("color");
                    String detailSize = (String) detail.get("size");
                    if (detailColor == null || detailSize == null) {
                        continue;
                    }
                    String key = detailColor + "|" + detailSize;
                    ProductSku matched = skuMap.get(key);
                    if (matched != null) {
                        detail.put("skuCode", matched.getSkuCode());
                        detail.put("skuMode", matched.getSkuMode() != null ? matched.getSkuMode() : "AUTO");
                        changed = true;
                    }
                }

                if (changed) {
                    productionOrderMapper.update(null,
                            new LambdaUpdateWrapper<ProductionOrder>()
                                    .eq(ProductionOrder::getId, order.getId())
                                    .set(ProductionOrder::getOrderDetails, objectMapper.writeValueAsString(detailList)));
                }
            } catch (Exception e) {
                log.warn("Failed to sync SKU to order {}: {}", order.getOrderNo(), e.getMessage());
            }
        }
    }

    private String generateSkuCode(String styleNo, String color, String size, Integer useSkuPrefix) {
        StringBuilder sb = new StringBuilder();
        if (useSkuPrefix != null && useSkuPrefix == 1) {
            sb.append("SKU");
        }
        sb.append(styleNo);
        if (color != null && !color.isEmpty()) {
            sb.append(color);
        }
        if (size != null && !size.isEmpty()) {
            sb.append(size);
        }
        return sb.toString();
    }

    private void createOrUpdateSku(StyleInfo style, String color, String size, Integer quantity) {
        String skuCode = generateSkuCode(style.getStyleNo(), color, size, style.getUseSkuPrefix());
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            log.error("Cannot createOrUpdateSku: tenantId is null for styleId={}, skuCode={}", style.getId(), skuCode);
            return;
        }

        ProductSku existing = this.getOne(new LambdaQueryWrapper<ProductSku>()
                .eq(ProductSku::getSkuCode, skuCode)
                .eq(ProductSku::getTenantId, tenantId));

        if (existing == null) {
            ProductSku sku = new ProductSku();
            sku.setSkuCode(skuCode);
            sku.setStyleId(style.getId());
            sku.setStyleNo(style.getStyleNo());
            sku.setColor(color);
            sku.setSize(size);
            sku.setStatus("ENABLED");
            sku.setStockQuantity(quantity != null ? quantity : 0);
            sku.setSalesPrice(style.getPrice());
            sku.setSkuMode(style.getSkuMode());
            sku.setTenantId(tenantId);
            this.save(sku);
            log.info("Created new SKU: {} with quantity={}", skuCode, quantity);
        } else {
            existing.setStyleNo(style.getStyleNo());
            // 只有未被手动编辑过的 SKU 才自动更新编码和数量
            if (!Integer.valueOf(1).equals(existing.getManuallyEdited())) {
                existing.setSkuCode(skuCode);
                existing.setStockQuantity(quantity != null ? quantity : 0);
            }
            this.updateById(existing);
        }
    }

    @Override
    public void updateUseSkuPrefix(Long styleId, Integer useSkuPrefix) {
        StyleInfo style = styleInfoMapper.selectById(styleId);
        if (style == null) {
            return;
        }

        style.setUseSkuPrefix(useSkuPrefix);
        styleInfoMapper.updateById(style);

        if ("AUTO".equals(style.getSkuMode())) {
            generateSkusForStyle(styleId);
            List<ProductSku> skus = listByStyleId(styleId);
            List<ProductSku> toUpdate = skus.stream()
                    .filter(sku -> {
                        String autoCode = generateSkuCode(style.getStyleNo(), sku.getColor(), sku.getSize(), useSkuPrefix);
                        if (!autoCode.equals(sku.getSkuCode())) {
                            sku.setSkuCode(autoCode);
                            sku.setManuallyEdited(0);
                            return true;
                        }
                        return false;
                    })
                    .collect(Collectors.toList());
            if (!toUpdate.isEmpty()) {
                this.updateBatchById(toUpdate);
            }
        }
    }

    @Override
    public ProductSku getBySkuCode(String skuCode) {
        if (!StringUtils.hasText(skuCode)) return null;
        Long tenantId = UserContext.tenantId();
        return getOne(new LambdaQueryWrapper<ProductSku>()
                .eq(ProductSku::getTenantId, tenantId)
                .eq(ProductSku::getSkuCode, skuCode)
                .last("LIMIT 1"), false);
    }

    @Override
    public List<ProductSku> listByTenantId(Long tenantId) {
        return list(new LambdaQueryWrapper<ProductSku>()
                .eq(ProductSku::getTenantId, tenantId));
    }

    @Override
    public String getSkuColorImage(String styleNo, String color) {
        if (!StringUtils.hasText(styleNo) || !StringUtils.hasText(color)) {
            return null;
        }
        Long tenantId = UserContext.tenantId();
        ProductSku sku = getOne(new LambdaQueryWrapper<ProductSku>()
                .eq(tenantId != null, ProductSku::getTenantId, tenantId)
                .eq(ProductSku::getStyleNo, styleNo.trim())
                .eq(ProductSku::getColor, color.trim())
                .isNotNull(ProductSku::getSkuColorImage)
                .ne(ProductSku::getSkuColorImage, "")
                .last("LIMIT 1"), false);
        return sku != null ? sku.getSkuColorImage() : null;
    }

    @Override
    public Map<String, String> getStyleColorImages(String styleNo) {
        if (!StringUtils.hasText(styleNo)) {
            return Map.of();
        }
        Long tenantId = UserContext.tenantId();
        List<ProductSku> skus = list(new LambdaQueryWrapper<ProductSku>()
                .eq(tenantId != null, ProductSku::getTenantId, tenantId)
                .eq(ProductSku::getStyleNo, styleNo.trim())
                .isNotNull(ProductSku::getSkuColorImage)
                .ne(ProductSku::getSkuColorImage, ""));
        return skus.stream()
                .filter(s -> StringUtils.hasText(s.getColor()) && StringUtils.hasText(s.getSkuColorImage()))
                .collect(Collectors.toMap(ProductSku::getColor, ProductSku::getSkuColorImage, (a, b) -> a));
    }
}
