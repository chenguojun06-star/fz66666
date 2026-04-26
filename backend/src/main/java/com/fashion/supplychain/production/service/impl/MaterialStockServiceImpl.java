package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.dto.MaterialBatchDetailDto;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialInboundMapper;
import com.fashion.supplychain.production.mapper.MaterialStockMapper;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
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

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

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

        IPage<MaterialStock> result = baseMapper.selectPage(pageInfo, wrapper);
        enrichConversionRate(result == null ? null : result.getRecords());
        return result;
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
        baseMapper.updateStockOnInbound(stock.getId(), quantity, warehouseLocation, unitPrice, supplierName, com.fashion.supplychain.common.UserContext.tenantId());

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
        int rows = baseMapper.decreaseStockWithCheck(stock.getId(), quantity, com.fashion.supplychain.common.UserContext.tenantId());
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
        if (!StringUtils.hasText(size)) {
            query.and(w -> w.isNull(MaterialStock::getSize).or().eq(MaterialStock::getSize, ""));
        }

        MaterialStock stock = this.getOne(query, false);
        if (stock != null) {
            int rows2 = baseMapper.decreaseStockWithCheck(stock.getId(), quantity, com.fashion.supplychain.common.UserContext.tenantId());
            if (rows2 == 0) {
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
        int rows = baseMapper.decreaseStockWithCheck(stockId, quantity, com.fashion.supplychain.common.UserContext.tenantId());
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
            boolean updated = false;
            if (p.getConversionRate() != null && (exist.getConversionRate() == null || exist.getConversionRate().compareTo(p.getConversionRate()) != 0)) {
                exist.setConversionRate(p.getConversionRate());
                updated = true;
            }
            // 补全可能缺失的物料属性（历史存量记录下次入库时自动补齐）
            if (exist.getSupplierId() == null && p.getSupplierId() != null) {
                exist.setSupplierId(p.getSupplierId());
                updated = true;
            }
            if (exist.getFabricComposition() == null && p.getFabricComposition() != null) {
                exist.setFabricComposition(p.getFabricComposition());
                updated = true;
            }
            if ((exist.getFabricWidth() == null || exist.getFabricWeight() == null) && StringUtils.hasText(p.getMaterialId())) {
                MaterialDatabase db = materialDatabaseService.getById(p.getMaterialId());
                if (db != null) {
                    if (exist.getFabricWidth() == null && StringUtils.hasText(db.getFabricWidth())) {
                        exist.setFabricWidth(db.getFabricWidth());
                        updated = true;
                    }
                    if (exist.getFabricWeight() == null && StringUtils.hasText(db.getFabricWeight())) {
                        exist.setFabricWeight(db.getFabricWeight());
                        updated = true;
                    }
                    if (exist.getFabricComposition() == null && StringUtils.hasText(db.getFabricComposition())) {
                        exist.setFabricComposition(db.getFabricComposition());
                        updated = true;
                    }
                }
            }
            if (updated) {
                exist.setUpdateTime(LocalDateTime.now());
                this.updateById(exist);
            }
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
        if (p.getConversionRate() != null) {
            newStock.setConversionRate(p.getConversionRate());
        }
        if (p.getSupplierName() != null) {
            newStock.setSupplierName(p.getSupplierName());
        }
        if (p.getSupplierId() != null) {
            newStock.setSupplierId(p.getSupplierId());
        }
        // 同步面料成分、幅宽、克重（优先从采购单，其次从物料资料库补充）
        if (p.getFabricComposition() != null) {
            newStock.setFabricComposition(p.getFabricComposition());
        }
        if (p.getFabricWidth() != null) {
            newStock.setFabricWidth(p.getFabricWidth());
        }
        if (p.getFabricWeight() != null) {
            newStock.setFabricWeight(p.getFabricWeight());
        }
        // 从物料资料库补充缺失的幅宽/克重/成分
        if (StringUtils.hasText(p.getMaterialId())) {
            MaterialDatabase dbMat = materialDatabaseService.getById(p.getMaterialId());
            if (dbMat != null) {
                if (newStock.getFabricComposition() == null && StringUtils.hasText(dbMat.getFabricComposition())) {
                    newStock.setFabricComposition(dbMat.getFabricComposition());
                }
                if (newStock.getFabricWidth() == null && StringUtils.hasText(dbMat.getFabricWidth())) {
                    newStock.setFabricWidth(dbMat.getFabricWidth());
                }
                if (newStock.getFabricWeight() == null && StringUtils.hasText(dbMat.getFabricWeight())) {
                    newStock.setFabricWeight(dbMat.getFabricWeight());
                }
            }
        }
        newStock.setLastInboundDate(LocalDateTime.now());
        newStock.setCreateTime(LocalDateTime.now());
        newStock.setUpdateTime(LocalDateTime.now());
        newStock.setDeleteFlag(0);

        this.save(newStock);
        return newStock;
    }

    private void enrichConversionRate(List<MaterialStock> records) {
        if (records == null || records.isEmpty()) {
            return;
        }
        List<String> codes = records.stream()
                .map(MaterialStock::getMaterialCode)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(Collectors.toList());
        if (codes.isEmpty()) {
            return;
        }
        Map<String, MaterialDatabase> dbMap = materialDatabaseService.list(
                new LambdaQueryWrapper<MaterialDatabase>()
                        .in(MaterialDatabase::getMaterialCode, codes)
                        .select(MaterialDatabase::getMaterialCode, MaterialDatabase::getConversionRate,
                                MaterialDatabase::getFabricWidth, MaterialDatabase::getFabricWeight,
                                MaterialDatabase::getFabricComposition, MaterialDatabase::getSupplierName,
                                MaterialDatabase::getUnitPrice, MaterialDatabase::getColor))
                .stream()
                .filter(item -> item != null && StringUtils.hasText(item.getMaterialCode()))
                .collect(Collectors.toMap(MaterialDatabase::getMaterialCode, d -> d, (a, b) -> a));
        if (dbMap.isEmpty()) {
            return;
        }
        for (MaterialStock record : records) {
            if (record == null || !StringUtils.hasText(record.getMaterialCode())) {
                continue;
            }
            MaterialDatabase db = dbMap.get(record.getMaterialCode());
            if (db == null) continue;
            if (record.getConversionRate() == null && db.getConversionRate() != null) {
                record.setConversionRate(db.getConversionRate());
            }
            if (!StringUtils.hasText(record.getFabricWidth())) record.setFabricWidth(db.getFabricWidth());
            if (!StringUtils.hasText(record.getFabricWeight())) record.setFabricWeight(db.getFabricWeight());
            if (!StringUtils.hasText(record.getFabricComposition())) record.setFabricComposition(db.getFabricComposition());
            if (!StringUtils.hasText(record.getSupplierName()) && StringUtils.hasText(db.getSupplierName())) record.setSupplierName(db.getSupplierName());
            if ((record.getUnitPrice() == null || record.getUnitPrice().compareTo(java.math.BigDecimal.ZERO) == 0) && db.getUnitPrice() != null) record.setUnitPrice(db.getUnitPrice());
        }
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

        // 兜底：如果 t_material_inbound 没有记录（库存由非采购入库路径写入），
        // 直接用 t_material_stock 本身构造一条批次，保证出库弹窗不为空
        if (batchDetails.isEmpty() && currentStock != null
                && currentStock.getQuantity() != null && currentStock.getQuantity() > 0) {
            MaterialBatchDetailDto dto = new MaterialBatchDetailDto();
            dto.setBatchNo(currentStock.getId());
            dto.setWarehouseLocation(StringUtils.hasText(currentStock.getLocation())
                    ? currentStock.getLocation() : "默认仓");
            dto.setColor(currentStock.getColor());
            dto.setSize(currentStock.getSize());
            dto.setInboundDate(currentStock.getLastInboundDate() != null
                    ? currentStock.getLastInboundDate() : currentStock.getUpdateTime());
            int locked = currentStock.getLockedQuantity() != null ? currentStock.getLockedQuantity() : 0;
            dto.setAvailableQty(Math.max(0, currentStock.getQuantity() - locked));
            dto.setLockedQty(locked);
            dto.setOutboundQty(0);
            dto.setExpiryDate(null);
            return java.util.Collections.singletonList(dto);
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

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void decreaseStockForCancelReceive(MaterialPurchase purchase, int quantity) {
        if (quantity <= 0) {
            return;
        }
        MaterialStock stock = findOrCreateStock(purchase);
        if (stock == null) {
            log.warn("decreaseStockForCancelReceive: 库存记录不存在，跳过: materialCode={}", purchase.getMaterialCode());
            return;
        }
        this.updateStockQuantity(stock.getId(), -quantity);
        log.info("Decreased stock for cancelReceive: id={}, delta={}", stock.getId(), quantity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void lockStock(String stockId, int quantity) {
        if (quantity <= 0 || !StringUtils.hasText(stockId)) {
            return;
        }
        int rows = baseMapper.lockStock(stockId, quantity, com.fashion.supplychain.common.UserContext.tenantId());
        if (rows == 0) {
            log.warn("lockStock failed: stockId={}", stockId);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void unlockStock(String stockId, int quantity) {
        if (quantity <= 0 || !StringUtils.hasText(stockId)) {
            return;
        }
        int rows = baseMapper.unlockStock(stockId, quantity, com.fashion.supplychain.common.UserContext.tenantId());
        if (rows == 0) {
            log.warn("unlockStock failed: stockId={}", stockId);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void decreaseStockAndUnlock(String stockId, int quantity) {
        if (quantity <= 0 || !StringUtils.hasText(stockId)) {
            return;
        }
        int rows = baseMapper.decreaseStockAndUnlock(stockId, quantity, com.fashion.supplychain.common.UserContext.tenantId());
        if (rows == 0) {
            MaterialStock stock = this.getById(stockId);
            String name = stock != null ? stock.getMaterialName() : "Unknown";
            throw new IllegalStateException("库存不足，扣减失败: " + name);
        }
        log.info("Decreased stock and unlocked: id={}, delta={}", stockId, quantity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateStockQuantity(String stockId, int delta) {
        if (delta == 0 || !StringUtils.hasText(stockId)) {
            return;
        }
        int rows = baseMapper.updateStockQuantity(stockId, delta, com.fashion.supplychain.common.UserContext.tenantId());
        if (rows == 0) {
            throw new IllegalStateException("库存更新失败: stockId=" + stockId);
        }
        log.info("Updated stock quantity: id={}, delta={}", stockId, delta);
    }
}
