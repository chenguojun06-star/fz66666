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
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
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
            if (trimmed.startsWith("[")) {
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
                Map<String, Object> config = objectMapper.readValue(trimmed,
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

            for (String color : colors) {
                for (String size : sizes) {
                    createOrUpdateSku(style, color, size);
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
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
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
                skuUpdate.setStockQuantity(0);
                skuUpdate.setManuallyEdited(1);
                skuUpdate.setSkuMode(style.getSkuMode());
                skuUpdate.setTenantId(tenantId);
                this.save(skuUpdate);
            }
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

    private void createOrUpdateSku(StyleInfo style, String color, String size) {
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
            sku.setStockQuantity(0);
            sku.setSalesPrice(style.getPrice());
            sku.setSkuMode(style.getSkuMode());
            sku.setTenantId(tenantId);
            this.save(sku);
            log.info("Created new SKU: {}", skuCode);
        } else {
            existing.setStyleNo(style.getStyleNo());
            if (!Integer.valueOf(1).equals(existing.getManuallyEdited())) {
                existing.setSkuCode(skuCode);
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
}
