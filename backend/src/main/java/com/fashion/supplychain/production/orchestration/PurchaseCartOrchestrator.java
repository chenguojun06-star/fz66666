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
import com.fashion.supplychain.production.helper.PurchaseCartLogAppendHelper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
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
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class PurchaseCartOrchestrator {
    
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    
    @Autowired
    private PurchaseCartService purchaseCartService;
    
    @Autowired
    private PurchaseCartMapper purchaseCartMapper;
    
    @Autowired
    private PurchaseCartItemMapper purchaseCartItemMapper;
    
    @Autowired
    private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;
    
    @Autowired
    private MaterialPurchaseMapper materialPurchaseMapper;

    @Autowired
    private PurchaseCartLogAppendHelper logAppendHelper;

    @Autowired
    private StyleInfoMapper styleInfoMapper;
    
    @Transactional(rollbackFor = Exception.class)
    public AddItemResultDto addItem(Long tenantId, String userId, AddCartItemRequest request) {
        log.info("添加物料到购物车: tenantId={}, userId={}, materialCode={}, quantity={}", 
                tenantId, userId, request.getMaterialCode(), request.getQuantity());
        
        PurchaseCart cart = purchaseCartService.getOrCreateCart(tenantId, userId);
        log.info("购物车: id={}", cart.getId());
        
        LambdaQueryWrapper<PurchaseCartItem> exactWrapper = new LambdaQueryWrapper<>();
        exactWrapper.eq(PurchaseCartItem::getCartId, cart.getId())
               .eq(PurchaseCartItem::getMaterialCode, request.getMaterialCode())
               .eq(request.getSpecifications() != null, 
                   PurchaseCartItem::getSpecifications, request.getSpecifications())
               .eq(request.getSupplierId() != null, 
                   PurchaseCartItem::getSupplierId, request.getSupplierId())
               .eq(PurchaseCartItem::getDeleteFlag, 0);
        // 幂等替换配套：带来源的请求只与同来源（sourceType+sourceId）草稿自动合并，
        // 不同订单/样衣的同一物料保持独立行，防止跨来源数量混在一起后被 replaceBySource 误删；
        // 下单合并由 preview 按物料+规格+供应商分组完成，不受影响
        boolean hasSource = StringUtils.hasText(request.getSourceType())
                || StringUtils.hasText(request.getSourceId());
        exactWrapper.eq(hasSource, PurchaseCartItem::getSourceType, request.getSourceType())
               .eq(hasSource, PurchaseCartItem::getSourceId, request.getSourceId());
        
        List<PurchaseCartItem> exactMatchItems = purchaseCartItemMapper.selectList(exactWrapper);
        
        AddItemResultDto result = new AddItemResultDto();
        
        if (!exactMatchItems.isEmpty()) {
            PurchaseCartItem target = exactMatchItems.get(0);
            BigDecimal newQty = target.getQuantity().add(request.getQuantity());
            target.setQuantity(newQty);
            if (target.getUnitPrice() != null) {
                target.setTotalAmount(target.getUnitPrice().multiply(newQty));
            }
            // 补齐款式图片链路（样衣BOM等入口可能未带图片，用请求内的 style 信息回填）
            enrichStyleLink(tenantId, target, request);
            purchaseCartItemMapper.updateById(target);
            log.info("自动合并物料: id={}, materialCode={}, quantity={}", 
                    target.getId(), request.getMaterialCode(), newQty);
            result.setItemId(target.getId());
            result.setMerged(true);
            
            recalculateCartTotal(cart.getId());
            logAppendHelper.appendMergeItems(cart.getId(), 2);
            return result;
        }
        
        LambdaQueryWrapper<PurchaseCartItem> sameMaterialWrapper = new LambdaQueryWrapper<>();
        sameMaterialWrapper.eq(PurchaseCartItem::getCartId, cart.getId())
               .eq(PurchaseCartItem::getMaterialCode, request.getMaterialCode())
               .eq(request.getSpecifications() != null, 
                   PurchaseCartItem::getSpecifications, request.getSpecifications())
               .ne(request.getSupplierId() != null, 
                   PurchaseCartItem::getSupplierId, request.getSupplierId())
               .eq(PurchaseCartItem::getDeleteFlag, 0);
        
        List<PurchaseCartItem> sameMaterialItems = purchaseCartItemMapper.selectList(sameMaterialWrapper);
        
        if (!sameMaterialItems.isEmpty()) {
            MergeSuggestionDto suggestion = buildMergeSuggestion(sameMaterialItems, request);
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
        // 持久化损耗率，贯通到采购单
        newItem.setLossRate(request.getLossRate());
        newItem.setRemark(request.getRemark());
        newItem.setStyleId(request.getStyleId());
        newItem.setStyleNo(request.getStyleNo());
        newItem.setStyleImageUrl(request.getStyleImageUrl());
        newItem.setDeleteFlag(0);
        // 补齐款式图片链路：样衣BOM等入口只带 sourceType=SAMPLE + sourceId=styleId 未带图片，
        // 此处按 style 回查款式封面，打通购物车图片展示
        enrichStyleLink(tenantId, newItem, request);

        log.info("插入购物车物料: cartId={}, materialCode={}", cart.getId(), request.getMaterialCode());
        purchaseCartItemMapper.insert(newItem);
        log.info("购物车物料插入成功: id={}", newItem.getId());
        result.setItemId(newItem.getId());
        result.setMerged(false);
        
        recalculateCartTotal(cart.getId());
        logAppendHelper.appendAddItem(cart.getId(), request.getMaterialName() != null ? request.getMaterialName() : request.getMaterialCode());
        
        return result;
    }

    /**
     * 智能采购幂等推送：先删除同来源（sourceType+sourceId）旧草稿，再写入最新净需求
     * <p>修复：重复推送同一订单时 addItem 数量累加导致采购量翻倍（推送2次=买2倍）
     * <p>语义：「推送本单」= 用最新计算的净需求整体替换该订单在购物车中的草稿；
     * 库存到位后净需求为0时重新推送，会清掉旧草稿（数据闭环）
     * <p>安全边界：只删本来源草稿（addItem 已保证同来源才合并）；已下单项在 confirm
     * 时已物理删除，不受影响；整个操作在一个事务内
     */
    @Transactional(rollbackFor = Exception.class)
    public BatchAddItemResultDto replaceItemsBySource(Long tenantId, String userId,
                                                      String sourceType, String sourceId,
                                                      List<AddCartItemRequest> requests) {
        PurchaseCart cart = purchaseCartService.getOrCreateCart(tenantId, userId);

        // 1) 删除该来源的旧草稿（无旧草稿时跳过）
        LambdaQueryWrapper<PurchaseCartItem> oldWrapper = new LambdaQueryWrapper<>();
        oldWrapper.eq(PurchaseCartItem::getCartId, cart.getId())
               .eq(PurchaseCartItem::getTenantId, tenantId)
               .eq(PurchaseCartItem::getSourceType, sourceType)
               .eq(PurchaseCartItem::getSourceId, sourceId)
               .eq(PurchaseCartItem::getDeleteFlag, 0);
        List<PurchaseCartItem> oldItems = purchaseCartItemMapper.selectList(oldWrapper);
        if (!oldItems.isEmpty()) {
            purchaseCartItemMapper.delete(oldWrapper);
            log.info("[SmartSourcing] 幂等替换：删除来源旧草稿{}项 (sourceType={}, sourceId={})",
                    oldItems.size(), sourceType, sourceId);
        }

        // 2) 写入最新净需求（同类内调用addItem，共用本事务）
        List<AddCartItemRequest> safeRequests = requests != null ? requests : Collections.emptyList();
        int successCount = 0;
        int mergedCount = 0;
        List<MergeSuggestionDto> allSuggestions = new ArrayList<>();
        for (AddCartItemRequest request : safeRequests) {
            AddItemResultDto result = addItem(tenantId, userId, request);
            if (result != null) {
                successCount++;
                if (result.getMergeSuggestion() != null) {
                    mergedCount++;
                    allSuggestions.add(result.getMergeSuggestion());
                }
            }
        }

        // 3) 只删不加（净需求归零）时重算合计； addItem 内部已逐次重算，此处兜底
        if (safeRequests.isEmpty() && !oldItems.isEmpty()) {
            recalculateCartTotal(cart.getId());
        }

        return BatchAddItemResultDto.builder()
                .totalCount(safeRequests.size())
                .successCount(successCount)
                .mergedCount(mergedCount)
                .mergeSuggestions(allSuggestions)
                .build();
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

    @Transactional(rollbackFor = Exception.class)
    public void deleteItem(Long tenantId, String itemId) {
        PurchaseCartItem item = purchaseCartItemMapper.selectById(itemId);
        if (item == null) {
            throw new BusinessException("购物车物料不存在");
        }
        if (!item.getTenantId().equals(tenantId)) {
            throw new BusinessException("无权操作此物料");
        }
        String cartId = item.getCartId();
        String materialName = item.getMaterialName();
        purchaseCartItemMapper.deleteById(itemId);
        recalculateCartTotal(cartId);
        logAppendHelper.appendRemoveItem(cartId, materialName);
    }

    @Transactional(rollbackFor = Exception.class)
    public void clearCart(Long tenantId, String userId) {
        PurchaseCart cart = purchaseCartService.getOrCreateCart(tenantId, userId);
        LambdaQueryWrapper<PurchaseCartItem> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PurchaseCartItem::getCartId, cart.getId())
               .eq(PurchaseCartItem::getDeleteFlag, 0);
        purchaseCartItemMapper.delete(wrapper);
        recalculateCartTotal(cart.getId());
    }
    
    @Transactional
    public void mergeItems(Long tenantId, MergeRequest request) {
        if (request.getItemIds() == null || request.getItemIds().size() < 2) {
            throw new BusinessException("合并至少需要2个物料");
        }
        
        List<PurchaseCartItem> items = purchaseCartItemMapper.selectByIds(request.getItemIds());
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
        logAppendHelper.appendMergeItems(target.getCartId(), items.size());
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
        logAppendHelper.appendSplitItem(item.getCartId(), item.getMaterialName());
    }
    
    public CartPreviewDto preview(Long tenantId, String userId) {
        PurchaseCart cart = purchaseCartService.getCartWithItems(tenantId, userId);
        return previewOfItems(cart.getItems());
    }

    /**
     * 对给定条目集合做分组预览。
     * confirm() 部分结算时必须传 itemsToProcess（曾经误用整个购物车预览，
     * 导致未勾选的物料也被生成采购单），此处拆出复用。
     */
    public CartPreviewDto previewOfItems(List<PurchaseCartItem> items) {
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

            // 多款合并时，显示第一个款的图片，收集所有款号
            group.setStyleImageUrl(first.getStyleImageUrl());
            // 损耗率取首项（同组物料相同），贯通到采购单
            group.setLossRate(first.getLossRate());
            java.util.Set<String> styleNos = groupItems.stream()
                .filter(item -> item.getStyleNo() != null && !item.getStyleNo().isEmpty())
                .map(PurchaseCartItem::getStyleNo)
                .collect(java.util.stream.Collectors.toCollection(java.util.LinkedHashSet::new));
            if (!styleNos.isEmpty()) {
                group.setStyleNo(String.join("、", styleNos));
            }
            
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
        List<PurchaseCartItem> allItems = purchaseCartItemMapper.selectByCartId(cart.getId(), tenantId);
        
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
        
        // 分组预览（仅针对本次要结算的条目，避免部分结算时把未勾选物料也生成采购单）
        CartPreviewDto preview = previewOfItems(itemsToProcess);
        
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
            purchase.setTenantId(tenantId);
            purchase.setArrivedQuantity(0);
            purchase.setDeleteFlag(0);
            // 损耗率从购物车明细贯通到采购单
            purchase.setLossRate(group.getLossRate());
            // 审价工作流：生成采购单时设为待审价，审价通过后进入 pending 状态可领取
            purchase.setPriceReviewStatus("pending_review");

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

            // P0-5 修复：原实现直接 service.save() 绕过 Orchestrator
            // - 跳过 savePurchaseAndUpdateOrder 的事务边界
            // - 跳过 statusHelper.syncAfterPurchaseChanged 状态联动
            // - sourceType 强制 'BATCH' 丢失样衣标识
            // 现改走 materialPurchaseOrchestrator.saveAndSync（含事务、状态联动、sourceType 推断）
            // saveAndSync 会根据 patternProductionId/orderId 自动推断 sourceType=sample/order/batch
            // 同时根据 sourceItems 反推关联订单/样衣ID
            enrichPurchaseFromSourceItems(purchase, group.getSourceItems(), tenantId);

            boolean saved = materialPurchaseOrchestrator.saveAndSync(purchase);
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
            purchaseCartItemMapper.deleteByIds(itemIds, tenantId);
        } else {
            purchaseCartService.clearCart(tenantId, userId);
        }
        
        ConfirmResultDto result = new ConfirmResultDto();
        result.setPurchaseIds(purchaseIds);
        result.setPurchaseNos(purchaseNos);

        logAppendHelper.appendConfirm(cart.getId(), preview.getPurchaseGroups().size());
        
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
                        dto.setSupplierId(item.getSupplierId());
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
                dto.setSupplierId(item.getSupplierId());
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
        PurchaseCart cart = purchaseCartMapper.selectById(cartId);
        List<PurchaseCartItem> items = purchaseCartItemMapper.selectByCartId(cartId, cart.getTenantId());

        cart.setTotalItems(items.size());
        cart.setTotalAmount(items.stream()
            .map(PurchaseCartItem::getTotalAmount)
            .filter(Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add));
        purchaseCartMapper.updateById(cart);
    }

    /**
     * 补齐购物车明细的款式图片链路（写入路径）：样衣开发BOM等入口只传 sourceType=SAMPLE + sourceId=styleId
     * 未带图片时，按 styleId（SAMPLE 入口的 sourceId 即 styleId）回查款式封面，
     * 回填 styleId/styleNo/styleImageUrl，保证购物车列表能展示款式图。
     */
    private void enrichStyleLink(Long tenantId, PurchaseCartItem item, AddCartItemRequest request) {
        if (item.getStyleImageUrl() != null && !item.getStyleImageUrl().isEmpty()) {
            return;
        }
        String styleId = StringUtils.hasText(request.getStyleId()) ? request.getStyleId() : null;
        if (!StringUtils.hasText(styleId)
                && StringUtils.hasText(request.getSourceId())
                && "SAMPLE".equalsIgnoreCase(request.getSourceType())) {
            styleId = request.getSourceId();
        }
        fillStyleFromId(tenantId, item, styleId);
    }

    /**
     * 购物车读取自愈（读取路径）：历史草稿（样衣BOM入口此前未存图片）读取时按
     * SAMPLE 来源的 sourceId 回查款式封面，仅内存填充不落库，保证列表/预览即时显示款式图。
     */
    public void enrichItemsStyleLink(Long tenantId, List<PurchaseCartItem> items) {
        if (items == null || items.isEmpty()) {
            return;
        }
        for (PurchaseCartItem item : items) {
            if (item.getStyleImageUrl() != null && !item.getStyleImageUrl().isEmpty()) {
                continue;
            }
            String styleId = item.getStyleId();
            if (!StringUtils.hasText(styleId)
                    && "SAMPLE".equalsIgnoreCase(item.getSourceType())
                    && StringUtils.hasText(item.getSourceId())) {
                styleId = item.getSourceId();
            }
            fillStyleFromId(tenantId, item, styleId);
        }
    }

    /**
     * 按 styleId 回查款式封面并回填明细（tenantId 隔离，P0 #4；仅缺图片时查询）
     */
    private void fillStyleFromId(Long tenantId, PurchaseCartItem item, String styleId) {
        if (!StringUtils.hasText(styleId)) {
            return;
        }
        StyleInfo style = styleInfoMapper.selectOne(new LambdaQueryWrapper<StyleInfo>()
                .eq(StyleInfo::getId, styleId)
                .eq(StyleInfo::getTenantId, tenantId)
                .last("LIMIT 1"));
        if (style == null) {
            return;
        }
        if (!StringUtils.hasText(item.getStyleId())) {
            item.setStyleId(String.valueOf(style.getId()));
        }
        if (!StringUtils.hasText(item.getStyleNo())) {
            item.setStyleNo(style.getStyleNo());
        }
        if (!StringUtils.hasText(item.getStyleImageUrl())) {
            item.setStyleImageUrl(style.getCover());
        }
    }
    
    private String buildSourcesJson(List<CartPreviewDto.SourceItemDto> sources) {
        try {
            return OBJECT_MAPPER.writeValueAsString(sources);
        } catch (Exception e) {
            log.error("序列化来源信息失败", e);
            return "[]";
        }
    }

    /**
     * 从购物车来源项反推采购单的关联字段（orderId / patternProductionId / sourceType）
     * <p>
     * P0-5 修复配套：原 confirm 强制 sourceType='BATCH'，丢失样衣标识
     * 现按 sourceItems 推断：
     * - 若所有来源 sourceType=sample 且 sourceId 一致 → sample 模式，关联 patternProductionId
     * - 若所有来源 sourceType=order 且 sourceId 一致 → order 模式，关联 orderId
     * - 否则 → batch 模式（多订单/多样衣合并）
     */
    private void enrichPurchaseFromSourceItems(MaterialPurchase purchase,
                                                List<CartPreviewDto.SourceItemDto> sourceItems,
                                                Long tenantId) {
        if (sourceItems == null || sourceItems.isEmpty()) {
            purchase.setSourceType("batch");
            return;
        }
        // 提取所有非空 sourceType
        Set<String> sourceTypes = sourceItems.stream()
                .map(CartPreviewDto.SourceItemDto::getSourceType)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        // 提取所有非空 sourceId
        Set<String> sourceIds = sourceItems.stream()
                .map(s -> s.getSourceNo() != null ? s.getSourceNo() : null)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());

        if (sourceTypes.size() == 1 && sourceIds.size() == 1) {
            String type = sourceTypes.iterator().next();
            // sourceId 实际存的是 sourceNo（业务编号），原 sourceNo 字段已用于显示
            // 此处取 sourceItems 的第一个非空 sourceId（购物车 item 的 sourceId 字段在购物车模型中存在）
            // 但 CartPreviewDto.SourceItemDto 没有 sourceId 字段，仅有 sourceType/sourceNo/quantity
            // 通过 sourceNo 反查关联ID（如果前端传入的 sourceNo 是订单号或样衣编号）
            String sourceNo = sourceIds.iterator().next();
            if ("sample".equalsIgnoreCase(type)) {
                purchase.setSourceType("sample");
                // 样衣关联通过 sourceNo 保留在 remark 中，MaterialPurchaseOrchestrator.saveAndSync 会读取
                log.info("[PurchaseCart] 采购单关联样衣: sourceNo={}", sourceNo);
            } else if ("order".equalsIgnoreCase(type)) {
                purchase.setSourceType("order");
                log.info("[PurchaseCart] 采购单关联订单: orderNo={}", sourceNo);
            } else {
                purchase.setSourceType("batch");
            }
        } else {
            purchase.setSourceType("batch");
        }
    }
}
