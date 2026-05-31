package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.*;
import com.fashion.supplychain.production.entity.PurchaseCart;
import com.fashion.supplychain.production.service.PurchaseCartService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping({"/api/production/purchase-cart", "/purchase-cart"})
@Slf4j
@org.springframework.security.access.prepost.PreAuthorize("isAuthenticated()")
public class PurchaseCartController {
    
    @Autowired
    private PurchaseCartService purchaseCartService;
    
    @GetMapping
    public Result<PurchaseCart> getCart() {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        PurchaseCart cart = purchaseCartService.getCartWithItems(tenantId, userId);
        return Result.success(cart);
    }
    
    @PostMapping("/items")
    public Result<AddItemResultDto> addItem(@RequestBody AddCartItemRequest request) {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        AddItemResultDto result = purchaseCartService.addItem(tenantId, userId, request);
        return Result.success(result);
    }
    
    @PostMapping("/items/batch")
    public Result<BatchAddItemResultDto> batchAddItems(@RequestBody BatchAddCartItemRequest request) {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        BatchAddItemResultDto result = purchaseCartService.batchAddItems(tenantId, userId, request.getItems());
        return Result.success(result);
    }
    
    @PutMapping("/items/{itemId}")
    public Result<Void> updateItem(@PathVariable String itemId, @RequestBody UpdateCartItemRequest request) {
        Long tenantId = UserContext.tenantId();
        purchaseCartService.updateItem(tenantId, itemId, request);
        return Result.success(null);
    }
    
    @DeleteMapping("/items/{itemId}")
    public Result<Void> deleteItem(@PathVariable String itemId) {
        Long tenantId = UserContext.tenantId();
        purchaseCartService.deleteItem(tenantId, itemId);
        return Result.success(null);
    }
    
    @PostMapping("/items/merge")
    public Result<Void> mergeItems(@RequestBody MergeRequest request) {
        Long tenantId = UserContext.tenantId();
        purchaseCartService.mergeItems(tenantId, request);
        return Result.success(null);
    }
    
    @PostMapping("/items/split")
    public Result<Void> splitItem(@RequestBody SplitRequest request) {
        Long tenantId = UserContext.tenantId();
        purchaseCartService.splitItem(tenantId, request);
        return Result.success(null);
    }
    
    @GetMapping("/merge-suggestions")
    public Result<List<MergeSuggestionDto>> getMergeSuggestions() {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        List<MergeSuggestionDto> suggestions = purchaseCartService.getMergeSuggestions(tenantId, userId);
        return Result.success(suggestions);
    }
    
    @PostMapping("/preview")
    public Result<CartPreviewDto> preview() {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        CartPreviewDto preview = purchaseCartService.preview(tenantId, userId);
        return Result.success(preview);
    }
    
    @PostMapping("/confirm")
    public Result<ConfirmResultDto> confirm(@RequestBody List<String> itemIds) {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        ConfirmResultDto result = purchaseCartService.confirm(tenantId, userId, itemIds);
        return Result.success(result);
    }
    
    @DeleteMapping
    public Result<Void> clearCart() {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        purchaseCartService.clearCart(tenantId, userId);
        return Result.success(null);
    }
}
