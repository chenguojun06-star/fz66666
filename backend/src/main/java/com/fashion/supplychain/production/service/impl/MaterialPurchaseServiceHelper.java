package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.helper.MaterialPurchaseHelper;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * MaterialPurchaseServiceImpl 的辅助类，包含快照填充、封面解析、
 * BOM需求生成和采购单号生成等非核心方法。
 */
@Component
@Slf4j
public class MaterialPurchaseServiceHelper {

    @Autowired
    private ObjectProvider<ProductionOrderService> productionOrderServiceProvider;

    // NOTE [架构债务] 跨模块依赖（style→production）
    // Helper做了Orchestrator级别的编排，应考虑迁移到MaterialPurchaseOrchestrator
    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleAttachmentService styleAttachmentService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private MaterialPurchaseMapper materialPurchaseMapper;

    // ──────────── 工具方法 ────────────

    Long tryParseLong(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            return Long.valueOf(raw.trim());
        } catch (Exception e) {
            return null;
        }
    }

    boolean isSameReceiver(MaterialPurchase purchase, String receiverId, String receiverName) {
        if (purchase == null) {
            return false;
        }
        String existingId = purchase.getReceiverId() == null ? null : purchase.getReceiverId().trim();
        String existingName = purchase.getReceiverName() == null ? null : purchase.getReceiverName().trim();
        if (StringUtils.hasText(receiverId) && StringUtils.hasText(existingId)) {
            if (receiverId.trim().equals(existingId)) {
                return true;
            }
        }
        if (StringUtils.hasText(receiverName) && StringUtils.hasText(existingName)) {
            return receiverName.trim().equals(existingName);
        }
        return false;
    }

    // ──────────── 快照与封面 ────────────

    void ensureSnapshot(MaterialPurchase materialPurchase) {
        if (materialPurchase == null) {
            return;
        }

        if (StringUtils.hasText(materialPurchase.getOrderId())) {
            ProductionOrderService productionOrderService = productionOrderServiceProvider.getIfAvailable();
            if (productionOrderService == null) {
                return;
            }
            ProductionOrder order = productionOrderService.getDetailById(materialPurchase.getOrderId());
            if (order != null) {
                if (!StringUtils.hasText(materialPurchase.getOrderNo())) {
                    materialPurchase.setOrderNo(order.getOrderNo());
                }
                if (!StringUtils.hasText(materialPurchase.getStyleId())) {
                    materialPurchase.setStyleId(order.getStyleId());
                }
                if (!StringUtils.hasText(materialPurchase.getStyleNo())) {
                    materialPurchase.setStyleNo(order.getStyleNo());
                }
                if (!StringUtils.hasText(materialPurchase.getStyleName())) {
                    materialPurchase.setStyleName(order.getStyleName());
                }
            }
        }

        if (StringUtils.hasText(materialPurchase.getStyleId())
                && (!StringUtils.hasText(materialPurchase.getStyleNo())
                        || !StringUtils.hasText(materialPurchase.getStyleName())
                        || !StringUtils.hasText(materialPurchase.getStyleCover()))) {
            Long styleId = tryParseLong(materialPurchase.getStyleId());
            if (styleId != null) {
                StyleInfo info = styleInfoService.getById(styleId);
                if (info != null) {
                    if (!StringUtils.hasText(materialPurchase.getStyleNo())) {
                        materialPurchase.setStyleNo(info.getStyleNo());
                    }
                    if (!StringUtils.hasText(materialPurchase.getStyleName())) {
                        materialPurchase.setStyleName(info.getStyleName());
                    }
                    if (!StringUtils.hasText(materialPurchase.getStyleCover())
                            && StringUtils.hasText(info.getCover())) {
                        materialPurchase.setStyleCover(info.getCover());
                    }
                }
            }
        }

        if (!StringUtils.hasText(materialPurchase.getStyleCover())
                && StringUtils.hasText(materialPurchase.getStyleId())) {
            String cover = resolveStyleCoverByStyleId(materialPurchase.getStyleId());
            if (StringUtils.hasText(cover)) {
                materialPurchase.setStyleCover(cover);
            }
        }

        if (!StringUtils.hasText(materialPurchase.getMaterialId())) {
            String mid = MaterialPurchaseHelper.resolveMaterialId(materialPurchase);
            if (StringUtils.hasText(mid)) {
                materialPurchase.setMaterialId(mid);
            }
        }
    }

    String resolveStyleCoverByStyleId(String styleId) {
        Long id = tryParseLong(styleId);
        if (id == null) {
            return null;
        }

        try {
            StyleInfo info = styleInfoService.getById(id);
            if (info != null && StringUtils.hasText(info.getCover())) {
                return info.getCover();
            }
        } catch (Exception e) {
            log.warn("Failed to query style info for cover resolve: styleId={}", id, e);
        }

        try {
            List<StyleAttachment> attachments = styleAttachmentService.listByStyleId(String.valueOf(id));
            if (attachments == null || attachments.isEmpty()) {
                return null;
            }
            for (StyleAttachment a : attachments) {
                if (a == null) {
                    continue;
                }
                if (!StringUtils.hasText(a.getFileUrl())) {
                    continue;
                }
                if (MaterialPurchaseHelper.looksLikeImage(a)) {
                    return a.getFileUrl();
                }
            }
        } catch (Exception e) {
            log.warn("Failed to query style attachments for cover resolve: styleId={}", id, e);
        }

        return null;
    }

    // ──────────── BOM 需求生成 ────────────

    static class OrderLine {
        public String color;
        public String size;
        public Integer quantity;
    }

    List<OrderLine> parseOrderLines(ProductionOrder order) {
        if (order == null) {
            return List.of();
        }

        String raw = order.getOrderDetails();
        if (!StringUtils.hasText(raw)) {
            OrderLine line = new OrderLine();
            line.color = StringUtils.hasText(order.getColor()) ? order.getColor() : "";
            line.size = StringUtils.hasText(order.getSize()) ? order.getSize() : "";
            line.quantity = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
            return List.of(line);
        }

        try {
            List<OrderLine> lines = objectMapper.readValue(raw, new TypeReference<List<OrderLine>>() {
            });
            if (lines == null) {
                return List.of();
            }
            List<OrderLine> cleaned = new ArrayList<>();
            for (OrderLine l : lines) {
                if (l == null) {
                    continue;
                }
                OrderLine next = new OrderLine();
                next.color = l.color == null ? "" : l.color.trim();
                next.size = l.size == null ? "" : l.size.trim();
                next.quantity = l.quantity == null ? 0 : l.quantity;
                cleaned.add(next);
            }
            return cleaned;
        } catch (Exception e) {
            OrderLine line = new OrderLine();
            line.color = StringUtils.hasText(order.getColor()) ? order.getColor() : "";
            line.size = StringUtils.hasText(order.getSize()) ? order.getSize() : "";
            line.quantity = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
            return List.of(line);
        }
    }

    List<MaterialPurchase> buildDemandItems(String orderId, MaterialPurchaseService purchaseService) {
        ProductionOrderService productionOrderService = productionOrderServiceProvider.getIfAvailable();
        if (productionOrderService == null) {
            throw new IllegalStateException("生产订单服务不可用");
        }
        ProductionOrder order = productionOrderService.getDetailById(orderId);
        if (order == null) {
            throw new NoSuchElementException("生产订单不存在");
        }
        if (!StringUtils.hasText(order.getStyleId())) {
            throw new IllegalArgumentException("生产订单缺少styleId");
        }

        Long styleId;
        try {
            styleId = Long.valueOf(order.getStyleId());
        } catch (Exception e) {
            throw new IllegalArgumentException("styleId格式错误");
        }

        List<StyleBom> bomList = styleBomService.listByStyleId(styleId);
        if (bomList == null) {
            bomList = List.of();
        }

        List<OrderLine> lines = parseOrderLines(order);

        Set<String> orderColorSet = new HashSet<>();
        Set<String> orderSizeSet = new HashSet<>();
        for (OrderLine l : lines) {
            if (l == null) {
                continue;
            }
            String lc = MaterialPurchaseHelper.normalizeMatchKey(l.color);
            String ls = MaterialPurchaseHelper.normalizeMatchKey(l.size);
            if (StringUtils.hasText(lc)) {
                orderColorSet.add(lc);
            }
            if (StringUtils.hasText(ls)) {
                orderSizeSet.add(ls);
            }
        }

        Map<String, MaterialPurchase> grouped = new HashMap<>();
        for (StyleBom bom : bomList) {
            if (bom == null) {
                continue;
            }
            String bomColor = bom.getColor() == null ? "" : bom.getColor().trim();
            String bomSize = bom.getSize() == null ? "" : bom.getSize().trim();

            List<String> bomColorOpts = MaterialPurchaseHelper.splitOptions(bomColor);
            Set<String> bomColorSet = bomColorOpts.isEmpty() ? null : new HashSet<>(bomColorOpts);
            List<String> bomSizeOpts = MaterialPurchaseHelper.splitOptions(bomSize);
            Set<String> bomSizeSet = bomSizeOpts.isEmpty() ? null : new HashSet<>(bomSizeOpts);

            bomColorSet = MaterialPurchaseHelper.intersectOrNull(bomColorSet, orderColorSet);
            bomSizeSet = MaterialPurchaseHelper.intersectOrNull(bomSizeSet, orderSizeSet);

            int matchedQty = 0;
            for (OrderLine l : lines) {
                if (l == null) {
                    continue;
                }
                String lc = MaterialPurchaseHelper.normalizeMatchKey(l.color);
                String ls = MaterialPurchaseHelper.normalizeMatchKey(l.size);
                boolean colorOk = bomColorSet == null || bomColorSet.contains(lc);
                boolean sizeOk = bomSizeSet == null || bomSizeSet.contains(ls);
                if (colorOk && sizeOk) {
                    matchedQty += l.quantity == null ? 0 : l.quantity;
                }
            }
            if (matchedQty <= 0) {
                continue;
            }

            BigDecimal usage = bom.getUsageAmount() == null ? BigDecimal.ZERO : bom.getUsageAmount();
            BigDecimal required = usage.multiply(BigDecimal.valueOf(matchedQty));
            int requiredInt = required.setScale(0, java.math.RoundingMode.CEILING).intValue();

            if (requiredInt <= 0) {
                continue;
            }

            String key = String.join("|",
                    StringUtils.hasText(bom.getMaterialCode()) ? bom.getMaterialCode() : "",
                    StringUtils.hasText(bom.getMaterialName()) ? bom.getMaterialName() : "",
                    StringUtils.hasText(bom.getSpecification()) ? bom.getSpecification() : "",
                    StringUtils.hasText(bom.getUnit()) ? bom.getUnit() : "",
                    bomColor,
                    bomSize,
                    StringUtils.hasText(bom.getSupplier()) ? bom.getSupplier() : "");

            MaterialPurchase agg = grouped.get(key);
            if (agg == null) {
                MaterialPurchase mp = new MaterialPurchase();
                mp.setPurchaseNo(nextPurchaseNo());
                mp.setMaterialCode(bom.getMaterialCode());
                mp.setMaterialName(bom.getMaterialName());
                mp.setMaterialType(MaterialPurchaseHelper.normalizeMaterialType(bom.getMaterialType()));
                mp.setSpecifications(bom.getSpecification());
                mp.setUnit(bom.getUnit());
                mp.setPurchaseQuantity(requiredInt);
                mp.setArrivedQuantity(0);
                mp.setSupplierName(bom.getSupplier());
                mp.setSupplierId("");
                mp.setUnitPrice(bom.getUnitPrice() == null ? BigDecimal.ZERO : bom.getUnitPrice());
                mp.setTotalAmount(BigDecimal.ZERO);
                mp.setOrderId(order.getId());
                mp.setOrderNo(order.getOrderNo());
                mp.setStyleId(order.getStyleId());
                mp.setStyleNo(order.getStyleNo());
                mp.setStyleName(order.getStyleName());
                mp.setMaterialId(MaterialPurchaseHelper.resolveMaterialId(mp));
                mp.setStyleCover(resolveStyleCoverByStyleId(order.getStyleId()));
                mp.setColor(StringUtils.hasText(bomColor) ? bomColor : null);
                mp.setSize(StringUtils.hasText(bomSize) ? bomSize : null);
                mp.setStatus(MaterialConstants.STATUS_PENDING);
                mp.setSourceType("order"); // 标记为生产订单驱动采购，不应写入独立进销存
                LocalDateTime now = LocalDateTime.now();
                mp.setCreateTime(now);
                mp.setUpdateTime(now);
                mp.setDeleteFlag(0);
                grouped.put(key, mp);
            } else {
                int nextQty = (agg.getPurchaseQuantity() == null ? 0 : agg.getPurchaseQuantity()) + requiredInt;
                agg.setPurchaseQuantity(nextQty);
                agg.setTotalAmount(BigDecimal.ZERO);
            }
        }

        return new ArrayList<>(grouped.values());
    }

    // ──────────── 采购单号生成 ────────────

    String nextPurchaseNo() {
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
}
