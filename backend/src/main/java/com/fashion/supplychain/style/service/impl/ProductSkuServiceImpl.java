package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
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
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

@Service
@Slf4j
@RequiredArgsConstructor
public class ProductSkuServiceImpl extends ServiceImpl<ProductSkuMapper, ProductSku> implements ProductSkuService {

    private final StyleInfoMapper styleInfoMapper;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
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
            // 解析配置: [{"color": "红色", "sizes": [{"size": "S", "quantity": 10}, ...]}, ...]
            // 或者可能是简单的 Map 结构，需根据实际情况调整。这里假设是 List<Map>
            // 根据 StyleInfoController 中的逻辑，sizeColorConfig 通常是 JSON 字符串

            // 简单处理：先尝试解析为 List<Map>
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
    @Transactional(rollbackFor = Exception.class)
    public void updateStock(String skuCode, int quantity) {
        if (!StringUtils.hasText(skuCode)) {
            return;
        }
        // 原子更新：单条 SQL 防止并发丢失更新
        boolean updated = this.update(null, new LambdaUpdateWrapper<ProductSku>()
                .eq(ProductSku::getSkuCode, skuCode)
                .setSql("stock_quantity = GREATEST(COALESCE(stock_quantity, 0) + (" + quantity + "), 0)"));
        if (updated) {
            log.info("Atomically updated stock for SKU {}: delta={}", skuCode, quantity);
            return;
        }
        // SKU不存在时自动创建（入库场景）
            if (quantity > 0) {
                try {
                    // skuCode 格式: styleNo-color-size
                    String[] parts = skuCode.split("-", 3);
                    if (parts.length >= 3) {
                        String styleNo = parts[0];
                        String color = parts[1];
                        String size = parts[2];

                        // 通过款号查找StyleInfo获取styleId
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

    private void createOrUpdateSku(StyleInfo style, String color, String size) {
        String skuCode = String.format("%s-%s-%s", style.getStyleNo(), color, size);

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
            // 默认价格继承款式价格
            sku.setSalesPrice(style.getPrice());
            this.save(sku);
            log.info("Created new SKU: {}", skuCode);
        } else {
            // 仅更新基本信息，不覆盖外部ID等
            existing.setStyleNo(style.getStyleNo()); // 防止款号变更
            this.updateById(existing);
        }
    }
}
