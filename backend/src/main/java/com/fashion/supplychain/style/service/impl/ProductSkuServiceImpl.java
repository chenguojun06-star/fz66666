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
            List<Map<String, Object>> configList = objectMapper.readValue(sizeColorConfig,
                    new TypeReference<List<Map<String, Object>>>() {
                    });

            for (Map<String, Object> colorGroup : configList) {
                String color = (String) colorGroup.get("color");
                Object sizesObj = colorGroup.get("sizes");

                if (sizesObj instanceof List) {
                    List<Map<String, Object>> sizes = (List<Map<String, Object>>) sizesObj;
                    for (Map<String, Object> sizeItem : sizes) {
                        String size = (String) sizeItem.get("size");

                        if (StringUtils.hasText(color) && StringUtils.hasText(size)) {
                            createOrUpdateSku(style, color.trim(), size.trim());
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.error("Failed to generate SKUs for style: " + styleId, e);
        }
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

                String autoCode = String.format("%s-%s-%s", style.getStyleNo(), skuUpdate.getColor(), skuUpdate.getSize());
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
                        String autoCode = String.format("%s-%s-%s", style.getStyleNo(), sku.getColor(), sku.getSize());
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

    private void createOrUpdateSku(StyleInfo style, String color, String size) {
        String skuCode = String.format("%s-%s-%s", style.getStyleNo(), color, size);
        Long tenantId = UserContext.tenantId();

        ProductSku existing = this.getOne(new LambdaQueryWrapper<ProductSku>()
                .eq(ProductSku::getSkuCode, skuCode));

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
}
