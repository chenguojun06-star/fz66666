package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.mapper.MaterialPickingMapper;
import com.fashion.supplychain.production.mapper.MaterialPickingItemMapper;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialStockService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.List;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;

@Service
public class MaterialPickingServiceImpl extends ServiceImpl<MaterialPickingMapper, MaterialPicking> implements MaterialPickingService {
    
    @Autowired
    private MaterialPickingItemMapper materialPickingItemMapper;
    
    @Autowired
    private MaterialStockService materialStockService;

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
        for (MaterialPickingItem item : items) {
            item.setPickingId(picking.getId());
            item.setCreateTime(LocalDateTime.now());
            materialPickingItemMapper.insert(item);
            
            // 扣减库存
            if (item.getMaterialStockId() != null) {
                materialStockService.decreaseStockById(item.getMaterialStockId(), item.getQuantity());
            } else {
                // Fallback: decrease by properties
                materialStockService.decreaseStock(item.getMaterialId(), item.getColor(), item.getSize(), item.getQuantity());
            }
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
}
