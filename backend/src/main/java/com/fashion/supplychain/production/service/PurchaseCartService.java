package com.fashion.supplychain.production.service;

import com.fashion.supplychain.production.dto.*;
import com.fashion.supplychain.production.entity.PurchaseCart;
import java.util.List;

public interface PurchaseCartService {
    
    PurchaseCart getOrCreateCart(Long tenantId, String userId);
    
    PurchaseCart getCartWithItems(Long tenantId, String userId);
    
    AddItemResultDto addItem(Long tenantId, String userId, AddCartItemRequest request);
    
    BatchAddItemResultDto batchAddItems(Long tenantId, String userId, List<AddCartItemRequest> requests);
    
    void updateItem(Long tenantId, String itemId, UpdateCartItemRequest request);
    
    void deleteItem(Long tenantId, String itemId);
    
    void mergeItems(Long tenantId, MergeRequest request);
    
    void splitItem(Long tenantId, SplitRequest request);
    
    CartPreviewDto preview(Long tenantId, String userId);
    
    ConfirmResultDto confirm(Long tenantId, String userId, List<String> itemIds);
    
    void clearCart(Long tenantId, String userId);
    
    List<MergeSuggestionDto> getMergeSuggestions(Long tenantId, String userId);
}
