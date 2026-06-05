package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.production.dto.*;
import com.fashion.supplychain.production.entity.PurchaseCart;
import com.fashion.supplychain.production.entity.PurchaseCartItem;
import com.fashion.supplychain.production.mapper.PurchaseCartMapper;
import com.fashion.supplychain.production.mapper.PurchaseCartItemMapper;
import com.fashion.supplychain.production.orchestration.PurchaseCartOrchestrator;
import com.fashion.supplychain.production.service.PurchaseCartService;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;

@Service
@Slf4j
public class PurchaseCartServiceImpl implements PurchaseCartService {
    
    @Autowired
    private PurchaseCartMapper purchaseCartMapper;
    
    @Autowired
    private PurchaseCartItemMapper purchaseCartItemMapper;
    
    @Autowired
    private PurchaseCartOrchestrator purchaseCartOrchestrator;
    
    @Override
    public PurchaseCart getOrCreateCart(Long tenantId, String userId) {
        LambdaQueryWrapper<PurchaseCart> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PurchaseCart::getTenantId, tenantId)
               .eq(PurchaseCart::getUserId, userId)
               .eq(PurchaseCart::getStatus, "DRAFT")
               .eq(PurchaseCart::getDeleteFlag, 0)
               .orderByDesc(PurchaseCart::getUpdatedTime)
               .last("LIMIT 1");
        
        PurchaseCart cart = purchaseCartMapper.selectOne(wrapper);
        if (cart == null) {
            cart = new PurchaseCart();
            cart.setTenantId(tenantId);
            cart.setUserId(userId);
            cart.setStatus("DRAFT");
            cart.setTotalItems(0);
            cart.setTotalAmount(BigDecimal.ZERO);
            cart.setDeleteFlag(0);
            purchaseCartMapper.insert(cart);
        }
        return cart;
    }
    
    @Override
    public PurchaseCart getCartWithItems(Long tenantId, String userId) {
        PurchaseCart cart = getOrCreateCart(tenantId, userId);
        List<PurchaseCartItem> items = purchaseCartItemMapper.selectByCartId(cart.getId());
        cart.setItems(items);
        return cart;
    }
    
    @Override
    public AddItemResultDto addItem(Long tenantId, String userId, AddCartItemRequest request) {
        return purchaseCartOrchestrator.addItem(tenantId, userId, request);
    }
    
    @Override
    public BatchAddItemResultDto batchAddItems(Long tenantId, String userId, List<AddCartItemRequest> requests) {
        int successCount = 0;
        int mergedCount = 0;
        List<MergeSuggestionDto> allSuggestions = new java.util.ArrayList<>();
        
        for (AddCartItemRequest request : requests) {
            AddItemResultDto result = purchaseCartOrchestrator.addItem(tenantId, userId, request);
            if (result != null) {
                successCount++;
                if (result.getMergeSuggestion() != null) {
                    mergedCount++;
                    allSuggestions.add(result.getMergeSuggestion());
                }
            }
        }
        
        return BatchAddItemResultDto.builder()
                .totalCount(requests.size())
                .successCount(successCount)
                .mergedCount(mergedCount)
                .mergeSuggestions(allSuggestions)
                .build();
    }
    
    @Override
    public void updateItem(Long tenantId, String itemId, UpdateCartItemRequest request) {
        purchaseCartOrchestrator.updateItem(tenantId, itemId, request);
    }
    
    @Override
    @Transactional
    public void deleteItem(Long tenantId, String itemId) {
        // 验证物料属于当前租户
        PurchaseCartItem item = purchaseCartItemMapper.selectById(itemId);
        if (item == null) {
            throw new com.fashion.supplychain.common.BusinessException("购物车物料不存在");
        }
        if (!item.getTenantId().equals(tenantId)) {
            throw new com.fashion.supplychain.common.BusinessException("无权操作此物料");
        }
        
        String cartId = item.getCartId();
        purchaseCartItemMapper.deleteById(itemId);
        recalculateCartTotal(cartId);
    }
    
    @Override
    public void mergeItems(Long tenantId, MergeRequest request) {
        purchaseCartOrchestrator.mergeItems(tenantId, request);
    }
    
    @Override
    public void splitItem(Long tenantId, SplitRequest request) {
        purchaseCartOrchestrator.splitItem(tenantId, request);
    }
    
    @Override
    public CartPreviewDto preview(Long tenantId, String userId) {
        return purchaseCartOrchestrator.preview(tenantId, userId);
    }
    
    @Override
    public ConfirmResultDto confirm(Long tenantId, String userId, List<String> itemIds) {
        return purchaseCartOrchestrator.confirm(tenantId, userId, itemIds);
    }
    
    @Override
    @Transactional
    public void clearCart(Long tenantId, String userId) {
        PurchaseCart cart = getOrCreateCart(tenantId, userId);
        LambdaQueryWrapper<PurchaseCartItem> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PurchaseCartItem::getCartId, cart.getId())
               .eq(PurchaseCartItem::getDeleteFlag, 0);
        purchaseCartItemMapper.delete(wrapper);
        recalculateCartTotal(cart.getId());
    }
    
    @Override
    public List<MergeSuggestionDto> getMergeSuggestions(Long tenantId, String userId) {
        return purchaseCartOrchestrator.getMergeSuggestions(tenantId, userId);
    }
    
    private void recalculateCartTotal(String cartId) {
        PurchaseCart cart = purchaseCartMapper.selectById(cartId);
        if (cart == null) {
            return;
        }
        List<PurchaseCartItem> items = purchaseCartItemMapper.selectByCartId(cartId);
        
        cart.setTotalItems(items.size());
        cart.setTotalAmount(items.stream()
            .map(PurchaseCartItem::getTotalAmount)
            .filter(amount -> amount != null)
            .reduce(BigDecimal.ZERO, BigDecimal::add));
        purchaseCartMapper.updateById(cart);
    }
}
