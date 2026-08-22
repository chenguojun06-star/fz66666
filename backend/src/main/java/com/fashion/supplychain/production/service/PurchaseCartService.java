package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.dto.*;
import com.fashion.supplychain.production.entity.PurchaseCart;
import java.util.List;

public interface PurchaseCartService extends IService<PurchaseCart> {
    
    PurchaseCart getOrCreateCart(Long tenantId, String userId);
    
    PurchaseCart getCartWithItems(Long tenantId, String userId);
    
    AddItemResultDto addItem(Long tenantId, String userId, AddCartItemRequest request);
    
    BatchAddItemResultDto batchAddItems(Long tenantId, String userId, List<AddCartItemRequest> requests);

    /**
     * 幂等替换同来源（sourceType+sourceId）草稿：先删旧再写入 requests
     * <p>智能采购推送专用：重复推送不叠加数量，净需求归零时清掉旧草稿
     */
    BatchAddItemResultDto replaceItemsBySource(Long tenantId, String userId,
                                               String sourceType, String sourceId,
                                               List<AddCartItemRequest> requests);
    
    void updateItem(Long tenantId, String itemId, UpdateCartItemRequest request);
    
    void deleteItem(Long tenantId, String itemId);
    
    void mergeItems(Long tenantId, MergeRequest request);
    
    void splitItem(Long tenantId, SplitRequest request);
    
    CartPreviewDto preview(Long tenantId, String userId);
    
    ConfirmResultDto confirm(Long tenantId, String userId, List<String> itemIds);
    
    void clearCart(Long tenantId, String userId);
    
    List<MergeSuggestionDto> getMergeSuggestions(Long tenantId, String userId);
}
