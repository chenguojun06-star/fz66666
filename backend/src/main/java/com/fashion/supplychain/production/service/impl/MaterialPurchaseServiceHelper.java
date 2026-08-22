package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
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

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

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

        // P0 修复（D-023 2026-07-09）：order_details 实际格式为 {"lines":[...],"pricing":{...}}
        //   而不是直接的数组。旧代码把它当数组解析，每次都失败走到 catch 兜底，
        //   导致整个订单被当作一行（size="M,S,L,XL,XXL" 逗号字符串），
        //   size_usage_map 匹配不到任何 key，全部 fallback 到 usage_amount，
        //   最终所有物料的采购数量都 = usage_amount * total_quantity，
        //   表现为"所有物料数量都一样"。
        //   修复：先尝试解析为对象（取 .lines 字段），失败再尝试数组，再失败才兜底。
        try {
            List<OrderLine> lines = tryParseOrderLines(raw);
            if (lines == null || lines.isEmpty()) {
                OrderLine line = new OrderLine();
                line.color = StringUtils.hasText(order.getColor()) ? order.getColor() : "";
                line.size = StringUtils.hasText(order.getSize()) ? order.getSize() : "";
                line.quantity = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
                return List.of(line);
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
                if (next.quantity != null && next.quantity > 0) {
                    cleaned.add(next);
                }
            }
            if (cleaned.isEmpty()) {
                OrderLine line = new OrderLine();
                line.color = StringUtils.hasText(order.getColor()) ? order.getColor() : "";
                line.size = StringUtils.hasText(order.getSize()) ? order.getSize() : "";
                line.quantity = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
                return List.of(line);
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

    /**
     * 尝试解析 order_details JSON：先按对象格式（{"lines":[...]}），失败再按数组格式。
     * 解析失败返回 null，让调用方走兜底逻辑。
     */
    private List<OrderLine> tryParseOrderLines(String raw) {
        if (!StringUtils.hasText(raw)) return null;
        String trimmed = raw.trim();
        try {
            if (trimmed.startsWith("{")) {
                Map<String, Object> root = objectMapper.readValue(trimmed, new TypeReference<Map<String, Object>>() {});
                Object linesRaw = root == null ? null : root.get("lines");
                if (linesRaw instanceof List<?>) {
                    String linesJson = objectMapper.writeValueAsString(linesRaw);
                    return objectMapper.readValue(linesJson, new TypeReference<List<OrderLine>>() {});
                }
                return null;
            }
            if (trimmed.startsWith("[")) {
                return objectMapper.readValue(trimmed, new TypeReference<List<OrderLine>>() {});
            }
            return null;
        } catch (Exception e) {
            log.warn("parse order_details failed, raw={}", raw == null ? "null" : raw.substring(0, Math.min(raw.length(), 100)), e);
            return null;
        }
    }

    List<MaterialPurchase> buildDemandItems(String orderId, MaterialPurchaseService purchaseService) {
        ProductionOrderService productionOrderService = productionOrderServiceProvider.getIfAvailable();
        if (productionOrderService == null) {
            return List.of();
        }
        ProductionOrder order = productionOrderService.getDetailById(orderId);
        if (order == null) {
            return List.of();
        }
        if (!StringUtils.hasText(order.getStyleId())) {
            return List.of();
        }
        Long styleId;
        try { styleId = Long.valueOf(order.getStyleId()); }
        catch (Exception e) { return List.of(); }

        List<StyleBom> bomList;
        try {
            bomList = styleBomService.listByStyleId(styleId);
        } catch (Exception e) {
            log.warn("查询BOM列表失败: styleId={}, error={}", styleId, e.getMessage());
            return List.of();
        }
        if (bomList == null || bomList.isEmpty()) return List.of();

        List<OrderLine> lines = parseOrderLines(order);
        Set<String> orderColorSet = extractColorSet(lines);
        Set<String> orderSizeSet = extractSizeSet(lines);

        Map<String, MaterialPurchase> grouped = aggregateBomToPurchases(bomList, lines, orderColorSet, orderSizeSet, order);
        List<MaterialPurchase> result = new ArrayList<>(grouped.values());
        enrichFromMaterialDatabase(result);
        return result;
    }

    /**
     * 构建订单的码数用量明细+汇总（联动采购数据）
     *
     * 返回结构：
     * - orderNo / totalQuantity：订单基础信息
     * - sizeQuantities: 码数→下单数量汇总（跨颜色累加，保留原始码名）
     * - colorQuantities: 颜色→下单数量汇总
     * - items: BOM 物料明细列表，每项含：
     *   - sizeUsages: 各码单件用量（原始码名）
     *   - requiredQty: 需求总量（Σ单件用量×码数量×(1+损耗率)，颜色/码匹配订单行）
     *   - purchasedQty: 该物料订单已采购总量（按物料编码/名称匹配）
     *   - diffQty: 差额（已采购-需求），负数=采购不足
     */
    public Map<String, Object> buildSizeUsageDetail(String orderId, MaterialPurchaseService purchaseService) {
        Map<String, Object> empty = new LinkedHashMap<>();
        empty.put("items", List.of());
        empty.put("sizeQuantities", Map.of());
        empty.put("colorQuantities", Map.of());

        ProductionOrderService productionOrderService = productionOrderServiceProvider.getIfAvailable();
        if (productionOrderService == null || purchaseService == null) {
            return empty;
        }
        ProductionOrder order = productionOrderService.getDetailById(orderId);
        if (order == null) {
            throw new NoSuchElementException("生产订单不存在");
        }
        Long styleId = tryParseLong(order.getStyleId());
        if (styleId == null) {
            return empty;
        }

        List<StyleBom> bomList;
        try {
            bomList = styleBomService.listByStyleId(styleId);
        } catch (Exception e) {
            log.warn("查询BOM列表失败: styleId={}, error={}", styleId, e.getMessage());
            return empty;
        }
        if (bomList == null || bomList.isEmpty()) {
            return empty;
        }

        List<OrderLine> lines = parseOrderLines(order);

        // 订单码数/颜色数量汇总（保留原始码名展示）
        Map<String, Integer> sizeQuantities = new LinkedHashMap<>();
        Map<String, Integer> colorQuantities = new LinkedHashMap<>();
        int totalQuantity = 0;
        for (OrderLine l : lines) {
            if (l == null || l.quantity == null || l.quantity <= 0) continue;
            totalQuantity += l.quantity;
            String sizeKey = l.size == null ? "" : l.size.trim();
            if (StringUtils.hasText(sizeKey)) {
                sizeQuantities.merge(sizeKey, l.quantity, Integer::sum);
            }
            String colorKey = l.color == null ? "" : l.color.trim();
            if (StringUtils.hasText(colorKey)) {
                colorQuantities.merge(colorKey, l.quantity, Integer::sum);
            }
        }

        // 订单已有采购记录（全部来源，含手动新增）
        List<MaterialPurchase> purchases = List.of();
        try {
            purchases = purchaseService.lambdaQuery()
                    .eq(MaterialPurchase::getOrderNo, order.getOrderNo())
                    .eq(MaterialPurchase::getDeleteFlag, 0)
                    .list();
        } catch (Exception e) {
            log.warn("查询订单采购记录失败: orderNo={}, error={}", order.getOrderNo(), e.getMessage());
        }

        Set<String> orderColorSet = extractColorSet(lines);
        Set<String> orderSizeSet = extractSizeSet(lines);
        boolean orderHasMultipleColors = orderColorSet.size() > 1;

        List<Map<String, Object>> items = new ArrayList<>();
        for (StyleBom bom : bomList) {
            if (bom == null) continue;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("materialCode", bom.getMaterialCode());
            item.put("materialName", bom.getMaterialName());
            item.put("materialType", bom.getMaterialType());
            item.put("unit", bom.getUnit());
            item.put("lossRate", bom.getLossRate());
            item.put("usageAmount", bom.getUsageAmount());
            item.put("sizeUsages", parseSizeUsageMapRaw(bom.getSizeUsageMap()));

            // 需求总量：颜色/码数匹配订单行（与采购需求生成口径一致）
            String bomColorRaw = bom.getColor() == null ? "" : bom.getColor().trim();
            String bomSizeRaw = bom.getSize() == null ? "" : bom.getSize().trim();
            Set<String> bomColorSet = MaterialPurchaseHelper.splitOptions(bomColorRaw).isEmpty()
                    ? null : new HashSet<>(MaterialPurchaseHelper.splitOptions(bomColorRaw));
            Set<String> bomSizeSet = MaterialPurchaseHelper.splitOptions(bomSizeRaw).isEmpty()
                    ? null : new HashSet<>(MaterialPurchaseHelper.splitOptions(bomSizeRaw));
            Set<String> matchColorSet = MaterialPurchaseHelper.intersectOrNull(bomColorSet, orderColorSet);
            Set<String> effectiveSizeSet = MaterialPurchaseHelper.intersectOrNull(bomSizeSet, orderSizeSet);
            Map<String, BigDecimal> sizeUsageMapParsed = parseSizeUsageMap(bom.getSizeUsageMap());

            BigDecimal required;
            if (!orderHasMultipleColors) {
                required = computeBomRequiredQuantity(bom, lines, matchColorSet, effectiveSizeSet, sizeUsageMapParsed);
            } else {
                // 多颜色订单：按各颜色分别计算后累加（与 aggregateBomToPurchases 口径一致）
                Set<String> targetColors = matchColorSet != null ? matchColorSet : orderColorSet;
                BigDecimal sum = BigDecimal.ZERO;
                for (String orderColor : targetColors) {
                    Set<String> singleColorSet = new HashSet<>();
                    singleColorSet.add(orderColor);
                    sum = sum.add(computeBomRequiredQuantity(bom, lines, singleColorSet, effectiveSizeSet, sizeUsageMapParsed));
                }
                required = sum;
            }
            item.put("requiredQty", required);

            // 已采购量：按物料编码（优先）或物料名称匹配
            String codeKey = MaterialPurchaseHelper.normalizeMatchKey(bom.getMaterialCode());
            String nameKey = MaterialPurchaseHelper.normalizeMatchKey(bom.getMaterialName());
            BigDecimal purchased = BigDecimal.ZERO;
            for (MaterialPurchase p : purchases) {
                if (p == null) continue;
                String pCode = MaterialPurchaseHelper.normalizeMatchKey(p.getMaterialCode());
                String pName = MaterialPurchaseHelper.normalizeMatchKey(p.getMaterialName());
                boolean codeMatch = StringUtils.hasText(codeKey) && codeKey.equals(pCode);
                boolean nameMatch = !codeMatch && StringUtils.hasText(nameKey) && nameKey.equals(pName);
                if (codeMatch || nameMatch) {
                    purchased = purchased.add(p.getPurchaseQuantity() == null ? BigDecimal.ZERO : p.getPurchaseQuantity());
                }
            }
            item.put("purchasedQty", purchased);
            item.put("diffQty", purchased.subtract(required));
            items.add(item);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderNo", order.getOrderNo());
        result.put("styleNo", order.getStyleNo());
        result.put("totalQuantity", totalQuantity);
        result.put("sizeQuantities", sizeQuantities);
        result.put("colorQuantities", colorQuantities);
        result.put("items", items);
        return result;
    }

    /**
     * 解析 BOM 各码用量 JSON，保留原始码名（仅 trim），用于前端展示。
     */
    private Map<String, BigDecimal> parseSizeUsageMapRaw(String json) {
        if (!StringUtils.hasText(json)) {
            return Collections.emptyMap();
        }
        try {
            TypeReference<Map<String, BigDecimal>> typeRef = new TypeReference<>() {};
            Map<String, BigDecimal> raw = objectMapper.readValue(json, typeRef);
            Map<String, BigDecimal> result = new LinkedHashMap<>(raw.size());
            for (Map.Entry<String, BigDecimal> entry : raw.entrySet()) {
                if (entry.getKey() != null && entry.getValue() != null) {
                    result.put(entry.getKey().trim(), entry.getValue());
                }
            }
            return result;
        } catch (Exception e) {
            return Collections.emptyMap();
        }
    }

    private Set<String> extractColorSet(List<OrderLine> lines) {
        Set<String> set = new HashSet<>();
        for (OrderLine l : lines) {
            if (l == null) continue;
            String lc = MaterialPurchaseHelper.normalizeMatchKey(l.color);
            if (StringUtils.hasText(lc)) set.add(lc);
        }
        return set;
    }

    private Set<String> extractSizeSet(List<OrderLine> lines) {
        Set<String> set = new HashSet<>();
        for (OrderLine l : lines) {
            if (l == null) continue;
            String ls = MaterialPurchaseHelper.normalizeMatchKey(l.size);
            if (StringUtils.hasText(ls)) set.add(ls);
        }
        return set;
    }

    private Map<String, MaterialPurchase> aggregateBomToPurchases(List<StyleBom> bomList, List<OrderLine> lines,
            Set<String> orderColorSet, Set<String> orderSizeSet, ProductionOrder order) {
        Map<String, MaterialPurchase> grouped = new LinkedHashMap<>();
        boolean orderHasMultipleColors = orderColorSet.size() > 1;

        for (StyleBom bom : bomList) {
            if (bom == null) continue;
            String bomColorRaw = bom.getColor() == null ? "" : bom.getColor().trim();
            String bomSizeRaw = bom.getSize() == null ? "" : bom.getSize().trim();
            List<String> bomColorOpts = MaterialPurchaseHelper.splitOptions(bomColorRaw);
            Set<String> bomColorSet = bomColorOpts.isEmpty() ? null : new HashSet<>(bomColorOpts);
            List<String> bomSizeOpts = MaterialPurchaseHelper.splitOptions(bomSizeRaw);
            Set<String> bomSizeSet = bomSizeOpts.isEmpty() ? null : new HashSet<>(bomSizeOpts);
            Set<String> matchColorSet = MaterialPurchaseHelper.intersectOrNull(bomColorSet, orderColorSet);
            Set<String> effectiveSizeSet = MaterialPurchaseHelper.intersectOrNull(bomSizeSet, orderSizeSet);

            Map<String, BigDecimal> sizeUsageMapParsed = parseSizeUsageMap(bom.getSizeUsageMap());

            if (!orderHasMultipleColors) {
                BigDecimal totalRequired = computeBomRequiredQuantity(bom, lines, matchColorSet, effectiveSizeSet, sizeUsageMapParsed);
                if (totalRequired.compareTo(BigDecimal.ZERO) <= 0) continue;
                String displayColor = bomColorRaw.isEmpty() ? (matchColorSet == null ? "" : String.join(",", matchColorSet)) : bomColorRaw;
                String key = buildGroupingKey(bom, displayColor, bomSizeRaw);
                MaterialPurchase agg = grouped.get(key);
                if (agg == null) {
                    grouped.put(key, createPurchaseFromBom(bom, displayColor, bomSizeRaw, totalRequired, order));
                } else {
                    agg.setPurchaseQuantity((agg.getPurchaseQuantity() == null ? BigDecimal.ZERO : agg.getPurchaseQuantity()).add(totalRequired));
                    agg.setTotalAmount(BigDecimal.ZERO);
                }
            } else {
                Set<String> targetColors = matchColorSet != null ? matchColorSet : orderColorSet;
                for (String orderColor : targetColors) {
                    Set<String> singleColorSet = new HashSet<>();
                    singleColorSet.add(orderColor);
                    BigDecimal colorRequired = computeBomRequiredQuantity(bom, lines, singleColorSet, effectiveSizeSet, sizeUsageMapParsed);
                    if (colorRequired.compareTo(BigDecimal.ZERO) <= 0) continue;
                    String key = buildGroupingKey(bom, orderColor, bomSizeRaw);
                    MaterialPurchase agg = grouped.get(key);
                    if (agg == null) {
                        grouped.put(key, createPurchaseFromBom(bom, orderColor, bomSizeRaw, colorRequired, order));
                    } else {
                        agg.setPurchaseQuantity((agg.getPurchaseQuantity() == null ? BigDecimal.ZERO : agg.getPurchaseQuantity()).add(colorRequired));
                        agg.setTotalAmount(BigDecimal.ZERO);
                    }
                }
            }
        }
        return grouped;
    }

    private BigDecimal computeBomRequiredQuantity(StyleBom bom, List<OrderLine> lines,
            Set<String> bomColorSet, Set<String> bomSizeSet, Map<String, BigDecimal> sizeUsageMapParsed) {
        BigDecimal totalRequired = BigDecimal.ZERO;
        boolean hasMatchedLine = false;
        for (OrderLine l : lines) {
            if (l == null) continue;
            String lc = MaterialPurchaseHelper.normalizeMatchKey(l.color);
            String ls = MaterialPurchaseHelper.normalizeMatchKey(l.size);
            boolean colorOk = bomColorSet == null || bomColorSet.contains(lc);
            boolean sizeOk = bomSizeSet == null || bomSizeSet.contains(ls);
            if (colorOk && sizeOk) {
                int qty = l.quantity == null ? 0 : l.quantity;
                if (qty <= 0) continue;
                hasMatchedLine = true;
                BigDecimal fromMap = sizeUsageMapParsed.get(ls);
                // P0 修复：大货采购需求计算必须使用 usageAmount（单件用量），禁止用 devUsageAmount 兜底
                // 开发用量(devUsageAmount)仅为样衣阶段预估，大货生产前必须已配置实际单件用量
                BigDecimal usage = (fromMap != null && fromMap.compareTo(BigDecimal.ZERO) > 0) ? fromMap
                        : (bom.getUsageAmount() == null ? BigDecimal.ZERO : bom.getUsageAmount());
                if (usage.compareTo(BigDecimal.ZERO) <= 0) {
                    String bomName = StringUtils.hasText(bom.getMaterialName()) ? bom.getMaterialName() : bom.getMaterialCode();
                    log.warn("[MaterialPurchase] BOM物料[{}]单件用量为空或0，大货采购需求计算跳过 styleId={}", bomName, bom.getStyleId());
                    continue;
                }
                BigDecimal lossRate = bom.getLossRate() != null ? bom.getLossRate() : BigDecimal.ZERO;
                BigDecimal lossMultiplier = BigDecimal.ONE.add(
                        lossRate.divide(new BigDecimal("100"), 6, java.math.RoundingMode.HALF_UP));
                totalRequired = totalRequired.add(usage.multiply(lossMultiplier).multiply(BigDecimal.valueOf(qty)));
            }
        }
        if (!hasMatchedLine) return BigDecimal.ZERO;
        return totalRequired.setScale(4, java.math.RoundingMode.HALF_UP);
    }

    private String buildGroupingKey(StyleBom bom, String bomColor, String bomSize) {
        return String.join("|",
                StringUtils.hasText(bom.getMaterialCode()) ? bom.getMaterialCode() : "",
                StringUtils.hasText(bom.getMaterialName()) ? bom.getMaterialName() : "",
                StringUtils.hasText(bom.getSpecification()) ? bom.getSpecification() : "",
                StringUtils.hasText(bom.getUnit()) ? bom.getUnit() : "",
                bomColor, bomSize,
                StringUtils.hasText(bom.getSupplier()) ? bom.getSupplier() : "");
    }

    private MaterialPurchase createPurchaseFromBom(StyleBom bom, String bomColor, String bomSize,
            BigDecimal requiredQty, ProductionOrder order) {
        MaterialPurchase mp = new MaterialPurchase();
        mp.setPurchaseNo(nextPurchaseNo());
        mp.setMaterialCode(bom.getMaterialCode());
        mp.setMaterialName(bom.getMaterialName());
        mp.setMaterialType(MaterialPurchaseHelper.normalizeMaterialType(bom.getMaterialType()));
        mp.setSpecifications(bom.getSpecification());
        mp.setUnit(bom.getUnit());
        mp.setConversionRate(bom.getConversionRate());
        mp.setPurchaseQuantity(requiredQty);
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
        mp.setSourceType("order");
        LocalDateTime now = LocalDateTime.now();
        mp.setCreateTime(now);
        mp.setUpdateTime(now);
        mp.setDeleteFlag(0);
        return mp;
    }

    private void enrichFromMaterialDatabase(List<MaterialPurchase> result) {
        List<String> matCodes = result.stream()
                .map(MaterialPurchase::getMaterialCode)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(java.util.stream.Collectors.toList());
        if (matCodes.isEmpty()) return;
        Map<String, MaterialDatabase> dbMap = materialDatabaseService.list(
                new LambdaQueryWrapper<MaterialDatabase>()
                        .in(MaterialDatabase::getMaterialCode, matCodes)
                        .select(MaterialDatabase::getId, MaterialDatabase::getMaterialCode,
                                MaterialDatabase::getFabricWidth, MaterialDatabase::getFabricWeight,
                                MaterialDatabase::getFabricComposition, MaterialDatabase::getSupplierName,
                                MaterialDatabase::getSupplierId, MaterialDatabase::getUnitPrice,
                                MaterialDatabase::getColor, MaterialDatabase::getSpecifications,
                                MaterialDatabase::getUnit, MaterialDatabase::getConversionRate))
                .stream()
                .filter(d -> d != null && StringUtils.hasText(d.getMaterialCode()))
                .collect(java.util.stream.Collectors.toMap(MaterialDatabase::getMaterialCode, d -> d, (a, b) -> a));
        for (MaterialPurchase mp : result) {
            MaterialDatabase db = dbMap.get(mp.getMaterialCode());
            if (db == null) continue;
            if (!StringUtils.hasText(mp.getFabricWidth())) mp.setFabricWidth(db.getFabricWidth());
            if (!StringUtils.hasText(mp.getFabricWeight())) mp.setFabricWeight(db.getFabricWeight());
            if (!StringUtils.hasText(mp.getFabricComposition())) mp.setFabricComposition(db.getFabricComposition());
            if (!StringUtils.hasText(mp.getSupplierName()) && StringUtils.hasText(db.getSupplierName())) mp.setSupplierName(db.getSupplierName());
            if (!StringUtils.hasText(mp.getSupplierId()) && StringUtils.hasText(db.getSupplierId())) mp.setSupplierId(db.getSupplierId());
            if ((mp.getUnitPrice() == null || mp.getUnitPrice().compareTo(BigDecimal.ZERO) == 0) && db.getUnitPrice() != null) mp.setUnitPrice(db.getUnitPrice());
            if (!StringUtils.hasText(mp.getColor()) && StringUtils.hasText(db.getColor())) mp.setColor(db.getColor());
        }
    }


    // ──────────── 各码用量解析 ────────────

    /**
     * 解析 BOM 的各码用量 JSON（如 {"S":1.5,"M":1.6,"XL":1.8}），
     * 返回规范化（小写 trim）后的 map；JSON 为空或解析失败时返回空 map。
     */
    private Map<String, BigDecimal> parseSizeUsageMap(String json) {
        if (!StringUtils.hasText(json)) {
            return Collections.emptyMap();
        }
        try {
            TypeReference<Map<String, BigDecimal>> typeRef = new TypeReference<>() {};
            Map<String, BigDecimal> raw = objectMapper.readValue(json, typeRef);
            Map<String, BigDecimal> normalized = new HashMap<>(raw.size());
            for (Map.Entry<String, BigDecimal> entry : raw.entrySet()) {
                if (entry.getKey() != null && entry.getValue() != null) {
                    normalized.put(entry.getKey().trim().toLowerCase(), entry.getValue());
                }
            }
            return normalized;
        } catch (Exception e) {
            log.debug("sizeUsageMap 解析失败，将使用统一 usageAmount 替代: {}", json);
            return Collections.emptyMap();
        }
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
