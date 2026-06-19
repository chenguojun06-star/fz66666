package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.dto.*;
import com.fashion.supplychain.production.entity.PurchaseCart;
import com.fashion.supplychain.production.entity.PurchaseCartItem;
import com.fashion.supplychain.production.mapper.PurchaseCartMapper;
import com.fashion.supplychain.production.mapper.PurchaseCartItemMapper;
import com.fashion.supplychain.production.orchestration.PurchaseCartOrchestrator;
import com.fashion.supplychain.production.service.PurchaseCartService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

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
    public void deleteItem(Long tenantId, String itemId) {
        purchaseCartOrchestrator.deleteItem(tenantId, itemId);
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
    public void clearCart(Long tenantId, String userId) {
        purchaseCartOrchestrator.clearCart(tenantId, userId);
    }
    
    @Override
    public List<MergeSuggestionDto> getMergeSuggestions(Long tenantId, String userId) {
        return purchaseCartOrchestrator.getMergeSuggestions(tenantId, userId);
    }
}
