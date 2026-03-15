package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialOutboundLogMapper;
import com.fashion.supplychain.production.mapper.MaterialPickingMapper;
import com.fashion.supplychain.production.mapper.MaterialPickingItemMapper;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialStockService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.time.LocalDateTime;
import java.util.List;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;

@Service
public class MaterialPickingServiceImpl extends ServiceImpl<MaterialPickingMapper, MaterialPicking> implements MaterialPickingService {

    @Autowired
    private MaterialPickingItemMapper materialPickingItemMapper;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialOutboundLogMapper materialOutboundLogMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String createPicking(MaterialPicking picking, List<MaterialPickingItem> items) {
        if (picking == null || items == null || items.isEmpty()) {
            throw new IllegalArgumentException("领料信息不能为空");
        }

        // 1. 保存主表
        String pickingNo = "MPK" + System.currentTimeMillis();
        picking.setPickingNo(pickingNo);
        picking.setCreateTime(LocalDateTime.now());
        picking.setUpdateTime(LocalDateTime.now());
        picking.setPickTime(LocalDateTime.now());
        picking.setStatus("completed"); // 直接完成
        picking.setDeleteFlag(0);

        // 获取当前用户
        if (picking.getPickerId() == null) {
            picking.setPickerId(UserContext.userId());
            picking.setPickerName(UserContext.username());
        }

        this.save(picking);

        // 2. 保存明细并扣减库存
        LocalDateTime outboundTime = LocalDateTime.now();
        for (MaterialPickingItem item : items) {
            item.setPickingId(picking.getId());
            item.setCreateTime(LocalDateTime.now());
            materialPickingItemMapper.insert(item);

            MaterialStock stock = resolveStock(item);

            // 扣减库存
            if (StringUtils.hasText(item.getMaterialStockId())) {
                materialStockService.decreaseStockById(item.getMaterialStockId(), item.getQuantity());
            } else {
                // Fallback: decrease by properties
                materialStockService.decreaseStock(item.getMaterialId(), item.getColor(), item.getSize(), item.getQuantity());
            }

            recordOutboundLog(picking, item, stock, outboundTime, "领料单直接出库");
        }

        return picking.getId();
    }

    @Override
    public List<MaterialPickingItem> getItemsByPickingId(String pickingId) {
        return materialPickingItemMapper.selectList(new LambdaQueryWrapper<MaterialPickingItem>()
                .eq(MaterialPickingItem::getPickingId, pickingId));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String savePendingPicking(MaterialPicking picking, List<MaterialPickingItem> items) {
        if (picking == null) throw new IllegalArgumentException("领料信息不能为空");
        if (picking.getPickingNo() == null) {
            picking.setPickingNo("MPK" + System.currentTimeMillis());
        }
        picking.setCreateTime(LocalDateTime.now());
        picking.setUpdateTime(LocalDateTime.now());
        if (picking.getPickTime() == null) picking.setPickTime(LocalDateTime.now());
        if (picking.getDeleteFlag() == null) picking.setDeleteFlag(0);
        if (picking.getPickerId() == null) {
            picking.setPickerId(UserContext.userId());
            picking.setPickerName(UserContext.username());
        }
        // 不覆盖 status，由调用方决定（"pending" 表示待仓库确认）
        this.save(picking);
        if (items != null) {
            for (MaterialPickingItem item : items) {
                item.setPickingId(picking.getId());
                if (item.getCreateTime() == null) item.setCreateTime(LocalDateTime.now());
                materialPickingItemMapper.insert(item);
                // ⚠️ 不扣减库存，等仓库确认出库后再扣
            }
        }
        return picking.getId();
    }

    private MaterialStock resolveStock(MaterialPickingItem item) {
        if (item == null) {
            return null;
        }
        if (StringUtils.hasText(item.getMaterialStockId())) {
            return materialStockService.getById(item.getMaterialStockId());
        }

        LambdaQueryWrapper<MaterialStock> query = new LambdaQueryWrapper<MaterialStock>()
                .eq(MaterialStock::getDeleteFlag, 0)
                .eq(StringUtils.hasText(item.getMaterialId()), MaterialStock::getMaterialId, item.getMaterialId())
                .eq(StringUtils.hasText(item.getColor()), MaterialStock::getColor, item.getColor())
                .eq(StringUtils.hasText(item.getSize()), MaterialStock::getSize, item.getSize());

        if (!StringUtils.hasText(item.getColor())) {
            query.and(wrapper -> wrapper.isNull(MaterialStock::getColor).or().eq(MaterialStock::getColor, ""));
        }
        if (!StringUtils.hasText(item.getSize())) {
            query.and(wrapper -> wrapper.isNull(MaterialStock::getSize).or().eq(MaterialStock::getSize, ""));
        }

        return materialStockService.getOne(query, false);
    }

    private void recordOutboundLog(
            MaterialPicking picking,
            MaterialPickingItem item,
            MaterialStock stock,
            LocalDateTime outboundTime,
            String reason) {
        MaterialOutboundLog log = new MaterialOutboundLog();
        log.setStockId(stock != null ? stock.getId() : item.getMaterialStockId());
        log.setMaterialCode(stock != null ? stock.getMaterialCode() : item.getMaterialCode());
        log.setMaterialName(stock != null ? stock.getMaterialName() : item.getMaterialName());
        log.setQuantity(item.getQuantity());
        log.setOperatorId(StringUtils.hasText(UserContext.userId()) ? UserContext.userId() : picking.getPickerId());
        log.setOperatorName(StringUtils.hasText(UserContext.username()) ? UserContext.username() : picking.getPickerName());
        log.setWarehouseLocation(stock != null ? stock.getLocation() : null);
        log.setRemark(reason + "|pickingNo=" + picking.getPickingNo());
        log.setOutboundTime(outboundTime);
        log.setCreateTime(outboundTime);
        log.setDeleteFlag(0);
        materialOutboundLogMapper.insert(log);

        if (stock != null && StringUtils.hasText(stock.getId())) {
            MaterialStock patch = new MaterialStock();
            patch.setId(stock.getId());
            patch.setLastOutboundDate(outboundTime);
            patch.setUpdateTime(outboundTime);
            materialStockService.updateById(patch);
        }
    }
}
