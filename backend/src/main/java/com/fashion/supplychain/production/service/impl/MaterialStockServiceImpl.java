package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.dto.MaterialBatchDetailDto;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialInboundMapper;
import com.fashion.supplychain.production.mapper.MaterialStockMapper;
import com.fashion.supplychain.production.service.MaterialStockService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class MaterialStockServiceImpl extends ServiceImpl<MaterialStockMapper, MaterialStock>
        implements MaterialStockService {

    @Autowired
    private MaterialInboundMapper materialInboundMapper;

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
        increaseStock(purchase, quantity, null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void increaseStock(MaterialPurchase purchase, int quantity, String warehouseLocation) {
        if (quantity == 0) {
            return;
        }
        MaterialStock stock = findOrCreateStock(purchase);

        // 使用增强的入库更新：同步单价、仓位、供应商、总值、入库日期
        java.math.BigDecimal unitPrice = purchase.getUnitPrice();
        String supplierName = purchase.getSupplierName();
        baseMapper.updateStockOnInbound(stock.getId(), quantity, warehouseLocation, unitPrice, supplierName);

        log.info("Increased material stock: id={}, delta={}, location={}, unitPrice={}, supplier={}",
                stock.getId(), quantity, warehouseLocation, unitPrice, supplierName);
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
        // 同步采购单的单价、供应商信息
        if (p.getUnitPrice() != null) {
            newStock.setUnitPrice(p.getUnitPrice());
        }
        if (p.getSupplierName() != null) {
            newStock.setSupplierName(p.getSupplierName());
        }
        newStock.setLastInboundDate(LocalDateTime.now());
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

    @Override
    public List<MaterialBatchDetailDto> getBatchDetails(String materialCode, String color, String size) {
        if (!StringUtils.hasText(materialCode)) {
            return java.util.Collections.emptyList();
        }

        // 1. 查询该物料的所有入库记录，按入库时间升序（FIFO）
        LambdaQueryWrapper<MaterialInbound> query = new LambdaQueryWrapper<MaterialInbound>()
                .eq(MaterialInbound::getMaterialCode, materialCode)
                .eq(MaterialInbound::getDeleteFlag, 0);

        // 如果指定了颜色，则只查询该颜色的批次
        if (StringUtils.hasText(color)) {
            query.eq(MaterialInbound::getColor, color);
        }

        // 如果指定了尺码，则只查询该尺码的批次
        if (StringUtils.hasText(size)) {
            query.eq(MaterialInbound::getSize, size);
        }

        // 按入库时间升序排列（先进先出）
        query.orderByAsc(MaterialInbound::getInboundTime);

        List<MaterialInbound> inboundList = materialInboundMapper.selectList(query);

        // 2. 查询当前库存，用于计算可用数量
        MaterialStock currentStock = this.getOne(new LambdaQueryWrapper<MaterialStock>()
                .eq(MaterialStock::getDeleteFlag, 0)
                .eq(MaterialStock::getMaterialCode, materialCode)
                .eq(StringUtils.hasText(color), MaterialStock::getColor, color)
                .eq(StringUtils.hasText(size), MaterialStock::getSize, size));

        // 3. 转换为批次明细DTO
        List<MaterialBatchDetailDto> batchDetails = inboundList.stream()
                .map(inbound -> {
                    MaterialBatchDetailDto dto = new MaterialBatchDetailDto();
                    dto.setBatchNo(inbound.getInboundNo());
                    dto.setWarehouseLocation(inbound.getWarehouseLocation());
                    dto.setColor(inbound.getColor());
                    dto.setSize(inbound.getSize());
                    dto.setInboundDate(inbound.getInboundTime());

                    // 简化逻辑：假设每个批次的可用数量 = 入库数量
                    // 实际应该 = 入库数量 - 已出库数量，需要关联出库记录表
                    // 这里先返回入库数量，后续可以优化
                    dto.setAvailableQty(inbound.getInboundQuantity());
                    dto.setLockedQty(0); // 默认无锁定
                    dto.setOutboundQty(0); // 暂无出库记录统计

                    // 过期日期暂不实现，后续可扩展
                    dto.setExpiryDate(null);

                    return dto;
                })
                .collect(Collectors.toList());

        // 4. 如果批次数量超过当前库存，需要按比例分配
        if (currentStock != null && !batchDetails.isEmpty()) {
            int totalBatchQty = batchDetails.stream()
                    .mapToInt(MaterialBatchDetailDto::getAvailableQty)
                    .sum();

            int currentQty = currentStock.getQuantity() != null ? currentStock.getQuantity() : 0;
            int lockedQty = currentStock.getLockedQuantity() != null ? currentStock.getLockedQuantity() : 0;

            // 如果批次总数大于当前库存，说明有出库记录，需要调整可用数量
            if (totalBatchQty > currentQty) {
                // 简单策略：按FIFO顺序扣减已出库数量
                int remainingQty = currentQty;
                for (MaterialBatchDetailDto dto : batchDetails) {
                    if (remainingQty <= 0) {
                        dto.setAvailableQty(0);
                    } else if (remainingQty >= dto.getAvailableQty()) {
                        // 该批次全部可用
                        remainingQty -= dto.getAvailableQty();
                    } else {
                        // 该批次部分可用
                        dto.setAvailableQty(remainingQty);
                        remainingQty = 0;
                    }
                }
            }

            // 设置锁定数量（简化：仅在第一个批次显示）
            if (!batchDetails.isEmpty() && lockedQty > 0) {
                batchDetails.get(0).setLockedQty(lockedQty);
            }
        }

        return batchDetails;
    }

    @Override
    public boolean updateSafetyStock(String stockId, Integer safetyStock) {
        if (!StringUtils.hasText(stockId) || safetyStock == null || safetyStock < 0) {
            return false;
        }
        MaterialStock stock = this.getById(stockId);
        if (stock == null) {
            return false;
        }
        MaterialStock patch = new MaterialStock();
        patch.setId(stockId);
        patch.setSafetyStock(safetyStock);
        patch.setUpdateTime(java.time.LocalDateTime.now());
        return this.updateById(patch);
    }
}
