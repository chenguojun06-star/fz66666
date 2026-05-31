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
    @Transactional
    public AddItemResultDto addItem(Long tenantId, String userId, AddCartItemRequest request) {
        return purchaseCartOrchestrator.addItem(tenantId, userId, request);
    }
    
    @Override
    @Transactional
    public void updateItem(Long tenantId, String itemId, UpdateCartItemRequest request) {
        purchaseCartOrchestrator.updateItem(tenantId, itemId, request);
    }
    
    @Override
    @Transactional
    public void deleteItem(Long tenantId, String itemId) {
        purchaseCartItemMapper.deleteById(itemId);
        recalculateCartTotal(tenantId);
    }
    
    @Override
    @Transactional
    public void mergeItems(Long tenantId, MergeRequest request) {
        purchaseCartOrchestrator.mergeItems(tenantId, request);
    }
    
    @Override
    @Transactional
    public void splitItem(Long tenantId, SplitRequest request) {
        purchaseCartOrchestrator.splitItem(tenantId, request);
    }
    
    @Override
    public CartPreviewDto preview(Long tenantId, String userId) {
        return purchaseCartOrchestrator.preview(tenantId, userId);
    }
    
    @Override
    @Transactional
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
        recalculateCartTotal(tenantId);
    }
    
    @Override
    public List<MergeSuggestionDto> getMergeSuggestions(Long tenantId, String userId) {
        return purchaseCartOrchestrator.getMergeSuggestions(tenantId, userId);
    }
    
    private void recalculateCartTotal(Long tenantId) {
        PurchaseCart cart = getOrCreateCart(tenantId, null);
        List<PurchaseCartItem> items = purchaseCartItemMapper.selectByCartId(cart.getId());
        
        cart.setTotalItems(items.size());
        cart.setTotalAmount(items.stream()
            .map(PurchaseCartItem::getTotalAmount)
            .filter(amount -> amount != null)
            .reduce(BigDecimal.ZERO, BigDecimal::add));
        purchaseCartMapper.updateById(cart);
    }
}
