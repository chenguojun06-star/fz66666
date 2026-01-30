package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialStockMapper;
import com.fashion.supplychain.production.service.MaterialStockService;
import java.time.LocalDateTime;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class MaterialStockServiceImpl extends ServiceImpl<MaterialStockMapper, MaterialStock>
        implements MaterialStockService {

    @Override
    public IPage<MaterialStock> queryPage(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);
        Page<MaterialStock> pageInfo = new Page<>(page, pageSize);

        String materialCode = (String) params.getOrDefault("materialCode", "");
        String materialName = (String) params.getOrDefault("materialName", "");
        String materialType = (String) params.getOrDefault("materialType", "");
        String color = (String) params.getOrDefault("color", "");
        String size = (String) params.getOrDefault("size", "");
        boolean lowStock = "true".equals(params.get("lowStock"));

        LambdaQueryWrapper<MaterialStock> wrapper = new LambdaQueryWrapper<MaterialStock>()
                .eq(MaterialStock::getDeleteFlag, 0)
                .like(StringUtils.hasText(materialCode), MaterialStock::getMaterialCode, materialCode)
                .like(StringUtils.hasText(materialName), MaterialStock::getMaterialName, materialName)
                .eq(StringUtils.hasText(materialType), MaterialStock::getMaterialType, materialType)
                .eq(StringUtils.hasText(color), MaterialStock::getColor, color)
                .eq(StringUtils.hasText(size), MaterialStock::getSize, size);

        if (lowStock) {
            wrapper.apply("quantity < safety_stock");
        }

        wrapper.orderByDesc(MaterialStock::getUpdateTime);

        return baseMapper.selectPage(pageInfo, wrapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void increaseStock(MaterialPurchase purchase, int quantity) {
        if (quantity == 0) {
            return;
        }
        MaterialStock stock = findOrCreateStock(purchase);
        baseMapper.updateStockQuantity(stock.getId(), quantity);
        log.info("Increased material stock: id={}, delta={}", stock.getId(), quantity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void decreaseStock(MaterialPurchase purchase, int quantity) {
        if (quantity <= 0) {
            return;
        }
        MaterialStock stock = findOrCreateStock(purchase);
        int rows = baseMapper.decreaseStockWithCheck(stock.getId(), quantity);
        if (rows == 0) {
            throw new IllegalStateException("库存不足，扣减失败: " + stock.getMaterialName());
        }
        log.info("Decreased material stock: id={}, delta={}", stock.getId(), quantity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void decreaseStock(String materialId, String color, String size, int quantity) {
        if (quantity <= 0) {
            return;
        }
        LambdaQueryWrapper<MaterialStock> query = new LambdaQueryWrapper<MaterialStock>()
                .eq(MaterialStock::getDeleteFlag, 0)
                .eq(MaterialStock::getMaterialId, materialId)
                .eq(StringUtils.hasText(color), MaterialStock::getColor, color)
                .eq(StringUtils.hasText(size), MaterialStock::getSize, size);

        if (!StringUtils.hasText(color)) {
            query.and(w -> w.isNull(MaterialStock::getColor).or().eq(MaterialStock::getColor, ""));
        }
        
        MaterialStock stock = this.getOne(query, false);
        if (stock != null) {
            int rows = baseMapper.decreaseStockWithCheck(stock.getId(), quantity);
            if (rows == 0) {
                throw new IllegalStateException("库存不足，扣减失败: " + stock.getMaterialName());
            }
        } else {
            log.warn("Stock not found for decrease: mid={}, color={}, size={}", materialId, color, size);
            throw new IllegalArgumentException("未找到对应的库存记录");
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void decreaseStockById(String stockId, int quantity) {
        if (quantity <= 0) {
            return;
        }
        if (!StringUtils.hasText(stockId)) {
            throw new IllegalArgumentException("库存ID不能为空");
        }
        int rows = baseMapper.decreaseStockWithCheck(stockId, quantity);
        if (rows == 0) {
            MaterialStock stock = this.getById(stockId);
            String name = stock != null ? stock.getMaterialName() : "Unknown";
            throw new IllegalStateException("库存不足，扣减失败: " + name);
        }
        log.info("Decreased material stock by id: id={}, delta={}", stockId, quantity);
    }

    private MaterialStock findOrCreateStock(MaterialPurchase p) {
        String mId = p.getMaterialId();
        String color = p.getColor() == null ? "" : p.getColor().trim();
        String size = p.getSize() == null ? "" : p.getSize().trim();

        // Try find existing
        LambdaQueryWrapper<MaterialStock> query = new LambdaQueryWrapper<MaterialStock>()
                .eq(MaterialStock::getDeleteFlag, 0)
                .eq(StringUtils.hasText(mId), MaterialStock::getMaterialId, mId)
                .eq(MaterialStock::getColor, color)
                .eq(MaterialStock::getSize, size);

        // If materialId is empty (legacy data?), try match by code
        if (!StringUtils.hasText(mId) && StringUtils.hasText(p.getMaterialCode())) {
            query = new LambdaQueryWrapper<MaterialStock>()
                    .eq(MaterialStock::getDeleteFlag, 0)
                    .eq(MaterialStock::getMaterialCode, p.getMaterialCode())
                    .eq(MaterialStock::getColor, color)
                    .eq(MaterialStock::getSize, size);
        }

        MaterialStock exist = this.getOne(query);
        if (exist != null) {
            return exist;
        }

        // Create new
        MaterialStock newStock = new MaterialStock();
        newStock.setMaterialId(p.getMaterialId());
        newStock.setMaterialCode(p.getMaterialCode());
        newStock.setMaterialName(p.getMaterialName());
        newStock.setMaterialType(p.getMaterialType());
        newStock.setSpecifications(p.getSpecifications());
        newStock.setUnit(p.getUnit());
        newStock.setColor(color);
        newStock.setSize(size);
        newStock.setQuantity(0);
        newStock.setLockedQuantity(0);
        newStock.setSafetyStock(100); // Default safety stock
        newStock.setCreateTime(LocalDateTime.now());
        newStock.setUpdateTime(LocalDateTime.now());
        newStock.setDeleteFlag(0);

        this.save(newStock);
        return newStock;
    }

    @Override
    public java.util.List<MaterialStock> getStocksByMaterialIds(java.util.List<String> materialIds) {
        if (materialIds == null || materialIds.isEmpty()) {
            return java.util.Collections.emptyList();
        }
        return this.list(new LambdaQueryWrapper<MaterialStock>()
                .eq(MaterialStock::getDeleteFlag, 0)
                .in(MaterialStock::getMaterialId, materialIds));
    }
}
