package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.dto.*;
import com.fashion.supplychain.production.entity.PurchaseCart;
import com.fashion.supplychain.production.entity.PurchaseCartItem;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.mapper.PurchaseCartItemMapper;
import com.fashion.supplychain.production.mapper.PurchaseCartMapper;
import com.fashion.supplychain.production.service.PurchaseCartService;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestrator;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

@Component
@Slf4j
public class PurchaseCartOrchestrator {
    
    private static final ObjectMapper objectMapper = new ObjectMapper();
    
    @Autowired
    private PurchaseCartService purchaseCartService;
    
    @Autowired
    private PurchaseCartMapper purchaseCartMapper;
    
    @Autowired
    private PurchaseCartItemMapper purchaseCartItemMapper;
    
    @Autowired
    private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;
    
    @Autowired
    private MaterialPurchaseService materialPurchaseService;
    
    @Autowired
    private MaterialPurchaseMapper materialPurchaseMapper;
    
    @Transactional(rollbackFor = Exception.class)
    public AddItemResultDto addItem(Long tenantId, String userId, AddCartItemRequest request) {
        log.info("添加物料到购物车: tenantId={}, userId={}, materialCode={}, quantity={}", 
                tenantId, userId, request.getMaterialCode(), request.getQuantity());
        
        PurchaseCart cart = purchaseCartService.getOrCreateCart(tenantId, userId);
        log.info("购物车: id={}", cart.getId());
        
        LambdaQueryWrapper<PurchaseCartItem> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PurchaseCartItem::getCartId, cart.getId())
               .eq(PurchaseCartItem::getMaterialCode, request.getMaterialCode())
               .eq(request.getSpecifications() != null, 
                   PurchaseCartItem::getSpecifications, request.getSpecifications())
               .eq(PurchaseCartItem::getDeleteFlag, 0);
        
        List<PurchaseCartItem> existItems = purchaseCartItemMapper.selectList(wrapper);
        
        AddItemResultDto result = new AddItemResultDto();
        
        if (!existItems.isEmpty()) {
            MergeSuggestionDto suggestion = buildMergeSuggestion(existItems, request);
            result.setMergeSuggestion(suggestion);
        }
        
        PurchaseCartItem newItem = new PurchaseCartItem();
        newItem.setCartId(cart.getId());
        newItem.setTenantId(tenantId);
        newItem.setMaterialCode(request.getMaterialCode());
        newItem.setMaterialName(request.getMaterialName());
        newItem.setMaterialType(request.getMaterialType());
        newItem.setSpecifications(request.getSpecifications());
        newItem.setUnit(request.getUnit());
        newItem.setQuantity(request.getQuantity());
        newItem.setSupplierId(request.getSupplierId());
        newItem.setSupplierName(request.getSupplierName());
        newItem.setUnitPrice(request.getUnitPrice());
        if (request.getUnitPrice() != null && request.getQuantity() != null) {
            newItem.setTotalAmount(request.getUnitPrice().multiply(request.getQuantity()));
        }
        newItem.setSourceType(request.getSourceType());
        newItem.setSourceId(request.getSourceId());
        newItem.setSourceNo(request.getSourceNo());
        newItem.setSourceQuantity(request.getSourceQuantity());
        newItem.setColor(request.getColor());
        newItem.setFabricComposition(request.getFabricComposition());
        newItem.setFabricWidth(request.getFabricWidth());
        newItem.setFabricWeight(request.getFabricWeight());
        newItem.setRemark(request.getRemark());
        newItem.setSortOrder(existItems.size());
        newItem.setDeleteFlag(0);
        
        log.info("插入购物车物料: cartId={}, materialCode={}", cart.getId(), request.getMaterialCode());
        purchaseCartItemMapper.insert(newItem);
        log.info("购物车物料插入成功: id={}", newItem.getId());
        result.setItemId(newItem.getId());
        
        recalculateCartTotal(cart.getId());
        
        return result;
    }
    
    @Transactional(rollbackFor = Exception.class)
    public void updateItem(Long tenantId, String itemId, UpdateCartItemRequest request) {
        PurchaseCartItem item = purchaseCartItemMapper.selectById(itemId);
        if (item == null) {
            throw new BusinessException("购物车物料不存在");
        }
        if (!item.getTenantId().equals(tenantId)) {
            throw new BusinessException("无权操作此物料");
        }
        
        if (request.getQuantity() != null) {
            item.setQuantity(request.getQuantity());
        }
        if (request.getSupplierId() != null) {
            item.setSupplierId(request.getSupplierId());
        }
        if (request.getSupplierName() != null) {
            item.setSupplierName(request.getSupplierName());
        }
        if (request.getUnitPrice() != null) {
            item.setUnitPrice(request.getUnitPrice());
        }
        if (request.getRemark() != null) {
            item.setRemark(request.getRemark());
        }
        
        if (item.getQuantity() != null && item.getUnitPrice() != null) {
            item.setTotalAmount(item.getQuantity().multiply(item.getUnitPrice()));
        }
        
        purchaseCartItemMapper.updateById(item);
        recalculateCartTotal(item.getCartId());
    }
    
    @Transactional
    public void mergeItems(Long tenantId, MergeRequest request) {
        if (request.getItemIds() == null || request.getItemIds().size() < 2) {
            throw new BusinessException("合并至少需要2个物料");
        }
        
        List<PurchaseCartItem> items = purchaseCartItemMapper.selectBatchIds(request.getItemIds());
        if (items.isEmpty()) {
            throw new BusinessException("要合并的物料不存在");
        }
        
        // 验证所有物料都属于当前租户
        for (PurchaseCartItem item : items) {
            if (!item.getTenantId().equals(tenantId)) {
                throw new BusinessException("无权操作此物料");
            }
        }
        
        PurchaseCartItem target = items.get(0);
        
        BigDecimal totalQty = request.getTargetQuantity() != null ? 
            request.getTargetQuantity() : target.getQuantity();
        for (PurchaseCartItem item : items) {
            if (!item.getId().equals(target.getId())) {
                totalQty = totalQty.add(item.getQuantity());
                purchaseCartItemMapper.deleteById(item.getId());
            }
        }
        
        target.setQuantity(totalQty);
        if (request.getTargetSupplierId() != null) {
            target.setSupplierId(request.getTargetSupplierId());
        }
        if (request.getTargetSupplierName() != null) {
            target.setSupplierName(request.getTargetSupplierName());
        }
        if (target.getUnitPrice() != null) {
            target.setTotalAmount(target.getUnitPrice().multiply(target.getQuantity()));
        }
        
        purchaseCartItemMapper.updateById(target);
        recalculateCartTotal(target.getCartId());
    }
    
    @Transactional
    public void splitItem(Long tenantId, SplitRequest request) {
        PurchaseCartItem item = purchaseCartItemMapper.selectById(request.getItemId());
        if (item == null) {
            throw new BusinessException("要拆分的物料不存在");
        }
        if (!item.getTenantId().equals(tenantId)) {
            throw new BusinessException("无权操作此物料");
        }
        
        BigDecimal splitQty = request.getSplitQuantity();
        if (splitQty == null || splitQty.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("拆分数量必须大于0");
        }
        if (splitQty.compareTo(item.getQuantity()) >= 0) {
            throw new BusinessException("拆分数量必须小于原数量");
        }
        
        item.setQuantity(item.getQuantity().subtract(splitQty));
        if (item.getUnitPrice() != null) {
            item.setTotalAmount(item.getUnitPrice().multiply(item.getQuantity()));
        }
        purchaseCartItemMapper.updateById(item);
        
        PurchaseCartItem newItem = new PurchaseCartItem();
        BeanUtils.copyProperties(item, newItem);
        newItem.setId(null);
        newItem.setSourceQuantity(splitQty);
        newItem.setQuantity(splitQty);
        if (item.getUnitPrice() != null) {
            newItem.setTotalAmount(item.getUnitPrice().multiply(splitQty));
        }
        newItem.setSortOrder(item.getSortOrder() + 1);
        newItem.setDeleteFlag(0);
        purchaseCartItemMapper.insert(newItem);
    }
    
    public CartPreviewDto preview(Long tenantId, String userId) {
        PurchaseCart cart = purchaseCartService.getCartWithItems(tenantId, userId);
        List<PurchaseCartItem> items = cart.getItems();
        
        Map<String, List<PurchaseCartItem>> groups = items.stream()
            .collect(Collectors.groupingBy(item -> 
                item.getMaterialCode() + "|" + 
                (item.getSpecifications() != null ? item.getSpecifications() : "") + "|" +
                (item.getSupplierId() != null ? item.getSupplierId() : "")
            ));
        
        CartPreviewDto preview = new CartPreviewDto();
        List<CartPreviewDto.PurchaseGroupDto> purchaseGroups = new ArrayList<>();
        BigDecimal totalAmount = BigDecimal.ZERO;
        
        for (Map.Entry<String, List<PurchaseCartItem>> entry : groups.entrySet()) {
            List<PurchaseCartItem> groupItems = entry.getValue();
            PurchaseCartItem first = groupItems.get(0);
            
            CartPreviewDto.PurchaseGroupDto group = new CartPreviewDto.PurchaseGroupDto();
            group.setGroupKey(entry.getKey());
            group.setMaterialCode(first.getMaterialCode());
            group.setMaterialName(first.getMaterialName());
            group.setSpecifications(first.getSpecifications());
            group.setSupplierId(first.getSupplierId());
            group.setSupplierName(first.getSupplierName());
            group.setUnitPrice(first.getUnitPrice());
            
            BigDecimal groupQty = groupItems.stream()
                .map(PurchaseCartItem::getQuantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            group.setTotalQuantity(groupQty);
            
            if (first.getUnitPrice() != null) {
                BigDecimal groupAmt = first.getUnitPrice().multiply(groupQty);
                group.setTotalAmount(groupAmt);
                totalAmount = totalAmount.add(groupAmt);
            }
            
            List<CartPreviewDto.SourceItemDto> sourceItems = groupItems.stream()
                .filter(item -> item.getSourceNo() != null)
                .map(item -> {
                    CartPreviewDto.SourceItemDto source = new CartPreviewDto.SourceItemDto();
                    source.setSourceType(item.getSourceType());
                    source.setSourceNo(item.getSourceNo());
                    source.setQuantity(item.getSourceQuantity());
                    return source;
                })
                .collect(Collectors.toList());
            group.setSourceItems(sourceItems);
            
            purchaseGroups.add(group);
        }
        
        preview.setPurchaseGroups(purchaseGroups);
        
        CartPreviewDto.PreviewSummary summary = new CartPreviewDto.PreviewSummary();
        summary.setTotalGroups(purchaseGroups.size());
        summary.setTotalItems(items.size());
        summary.setTotalAmount(totalAmount);
        preview.setSummary(summary);
        
        return preview;
    }
    
    @Transactional
    public ConfirmResultDto confirm(Long tenantId, String userId, List<String> itemIds) {
        // 获取购物车并验证租户
        PurchaseCart cart = purchaseCartService.getOrCreateCart(tenantId, userId);
        List<PurchaseCartItem> allItems = purchaseCartItemMapper.selectByCartId(cart.getId());
        
        // 过滤要处理的物料
        List<PurchaseCartItem> itemsToProcess;
        if (itemIds != null && !itemIds.isEmpty()) {
            // 验证所有指定物料都属于当前购物车和租户
            itemsToProcess = allItems.stream()
                    .filter(item -> itemIds.contains(item.getId()))
                    .collect(Collectors.toList());
            if (itemsToProcess.size() != itemIds.size()) {
                throw new BusinessException("部分物料不存在或无权操作");
            }
        } else {
            itemsToProcess = allItems;
        }
        
        // 分组预览
        CartPreviewDto preview = preview(tenantId, userId);
        
        List<String> purchaseIds = new ArrayList<>();
        List<String> purchaseNos = new ArrayList<>();
        
        for (CartPreviewDto.PurchaseGroupDto group : preview.getPurchaseGroups()) {
            MaterialPurchase purchase = new MaterialPurchase();
            purchase.setMaterialCode(group.getMaterialCode());
            purchase.setMaterialName(group.getMaterialName());
            purchase.setSpecifications(group.getSpecifications());
            purchase.setSupplierId(group.getSupplierId());
            purchase.setSupplierName(group.getSupplierName());
            purchase.setUnitPrice(group.getUnitPrice());
            purchase.setPurchaseQuantity(group.getTotalQuantity());
            purchase.setTotalAmount(group.getTotalAmount());
            purchase.setStatus(MaterialConstants.STATUS_PENDING);
            purchase.setSourceType("BATCH");
            purchase.setTenantId(tenantId);
            purchase.setArrivedQuantity(0);
            purchase.setDeleteFlag(0);
            
            // 设置必需的字段
            if (!org.springframework.util.StringUtils.hasText(purchase.getUnit())) {
                purchase.setUnit("-");
            }
            if (purchase.getUnitPrice() == null) {
                purchase.setUnitPrice(BigDecimal.ZERO);
            }
            
            // 生成采购单号
            purchase.setPurchaseNo(nextPurchaseNo());
            
            String sourcesJson = buildSourcesJson(group.getSourceItems());
            purchase.setRemark(sourcesJson);
            
            // 直接使用 service 保存，绕过 orchestrator 的 savePurchaseAndUpdateOrder 逻辑
            boolean saved = materialPurchaseService.save(purchase);
            if (!saved) {
                throw new BusinessException("保存采购单失败");
            }
            
            String purchaseId = purchase.getId();
            String purchaseNo = purchase.getPurchaseNo();
            purchaseIds.add(purchaseId);
            purchaseNos.add(purchaseNo);
        }
        
        // 删除已下单的物料
        if (itemIds != null && !itemIds.isEmpty()) {
            purchaseCartItemMapper.deleteByIds(itemIds);
        } else {
            purchaseCartService.clearCart(tenantId, userId);
        }
        
        ConfirmResultDto result = new ConfirmResultDto();
        result.setPurchaseIds(purchaseIds);
        result.setPurchaseNos(purchaseNos);
        
        return result;
    }
    
    private String nextPurchaseNo() {
        LocalDateTime now = LocalDateTime.now();
        String ts = now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS"));
        for (int i = 0; i < 6; i++) {
            int rand = (int) (ThreadLocalRandom.current().nextDouble() * 900) + 100;
            String candidate = MaterialConstants.PURCHASE_NO_PREFIX + ts + rand;
            long cnt = materialPurchaseMapper.selectCount(
                    new LambdaQueryWrapper<MaterialPurchase>().eq(MaterialPurchase::getPurchaseNo, candidate));
            if (cnt == 0) {
                return candidate;
            }
        }
        String nano = String.valueOf(System.nanoTime());
        String suffix = nano.length() > 6 ? nano.substring(nano.length() - 6) : nano;
        return MaterialConstants.PURCHASE_NO_PREFIX + ts + suffix;
    }
    
    public List<MergeSuggestionDto> getMergeSuggestions(Long tenantId, String userId) {
        PurchaseCart cart = purchaseCartService.getCartWithItems(tenantId, userId);
        List<PurchaseCartItem> items = cart.getItems();
        
        Map<String, List<PurchaseCartItem>> groups = items.stream()
            .collect(Collectors.groupingBy(item ->
                item.getMaterialCode() + "|" + 
                (item.getSpecifications() != null ? item.getSpecifications() : "")
            ));
        
        List<MergeSuggestionDto> suggestions = new ArrayList<>();
        
        for (Map.Entry<String, List<PurchaseCartItem>> entry : groups.entrySet()) {
            List<PurchaseCartItem> groupItems = entry.getValue();
            
            Set<String> suppliers = groupItems.stream()
                .map(PurchaseCartItem::getSupplierId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
            
            if (suppliers.size() > 1) {
                MergeSuggestionDto suggestion = new MergeSuggestionDto();
                suggestion.setMaterialCode(groupItems.get(0).getMaterialCode());
                suggestion.setMaterialName(groupItems.get(0).getMaterialName());
                suggestion.setSpecifications(groupItems.get(0).getSpecifications());
                
                List<MergeSuggestionDto.MergeableItemDto> mergeableItems = groupItems.stream()
                    .map(item -> {
                        MergeSuggestionDto.MergeableItemDto dto = new MergeSuggestionDto.MergeableItemDto();
                        dto.setId(item.getId());
                        dto.setSupplierName(item.getSupplierName());
                        dto.setQuantity(item.getQuantity());
                        return dto;
                    })
                    .collect(Collectors.toList());
                suggestion.setItems(mergeableItems);
                
                suggestion.setSuggestion("可合并，共" + groupItems.size() + "个供应商");
                suggestions.add(suggestion);
            }
        }
        
        return suggestions;
    }
    
    private MergeSuggestionDto buildMergeSuggestion(List<PurchaseCartItem> existItems, AddCartItemRequest request) {
        MergeSuggestionDto suggestion = new MergeSuggestionDto();
        suggestion.setMaterialCode(request.getMaterialCode());
        suggestion.setMaterialName(request.getMaterialName());
        suggestion.setSpecifications(request.getSpecifications());
        
        List<MergeSuggestionDto.MergeableItemDto> items = existItems.stream()
            .map(item -> {
                MergeSuggestionDto.MergeableItemDto dto = new MergeSuggestionDto.MergeableItemDto();
                dto.setId(item.getId());
                dto.setSupplierName(item.getSupplierName());
                dto.setQuantity(item.getQuantity());
                return dto;
            })
            .collect(Collectors.toList());
        suggestion.setItems(items);
        
        suggestion.setSuggestion("发现相同物料，可选择合并");
        return suggestion;
    }
    
    private void recalculateCartTotal(String cartId) {
        List<PurchaseCartItem> items = purchaseCartItemMapper.selectByCartId(cartId);
        
        PurchaseCart cart = purchaseCartMapper.selectById(cartId);
        cart.setTotalItems(items.size());
        cart.setTotalAmount(items.stream()
            .map(PurchaseCartItem::getTotalAmount)
            .filter(Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add));
        purchaseCartMapper.updateById(cart);
    }
    
    private String buildSourcesJson(List<CartPreviewDto.SourceItemDto> sources) {
        try {
            return objectMapper.writeValueAsString(sources);
        } catch (Exception e) {
            log.error("序列化来源信息失败", e);
            return "[]";
        }
    }
}
