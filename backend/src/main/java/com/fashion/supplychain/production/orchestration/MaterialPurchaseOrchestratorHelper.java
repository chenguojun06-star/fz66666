package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * MaterialPurchaseOrchestrator 辅助类
 * 负责: 列表富化Map构建、需求批量计算、同日同款订单查询、工具方法
 */
@Component
@Slf4j
public class MaterialPurchaseOrchestratorHelper {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private com.fashion.supplychain.style.service.StyleInfoService styleInfoService;

    /* ========== 列表富化 ========== */

    /**
     * 查询采购列表并补充 orderQuantity 字段
     */
    public Map<String, Object> listWithEnrichment(Map<String, Object> params) {
        String ctxFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        Long ctxTenantId = com.fashion.supplychain.common.UserContext.tenantId();
        if (StringUtils.hasText(ctxFactoryId)) {
            TenantAssert.assertTenantContext();
            List<String> factoryOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(ProductionOrder::getTenantId, ctxTenantId)
                            .eq(ProductionOrder::getFactoryId, ctxFactoryId)
                            .notIn(ProductionOrder::getStatus, "scrapped", "closed", "completed", "cancelled", "archived")
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
            ).stream().map(ProductionOrder::getId).collect(Collectors.toList());
            if (factoryOrderIds.isEmpty()) {
                return buildPageResult(List.of(), new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>());
            }
            params = params != null ? new HashMap<>(params) : new HashMap<>();
            params.put("_factoryOrderIds", factoryOrderIds);
        }
        IPage<MaterialPurchase> page = materialPurchaseService.queryPage(params);
        List<MaterialPurchase> records = page.getRecords();

        if (records == null || records.isEmpty()) {
            return buildPageResult(List.of(), page);
        }

        Set<String> orderIds = new HashSet<>();
        Set<String> patternProductionIds = new HashSet<>();
        for (MaterialPurchase record : records) {
            String sourceType = record.getSourceType();
            if ("order".equals(sourceType) && StringUtils.hasText(record.getOrderId())) {
                orderIds.add(record.getOrderId());
            } else if ("sample".equals(sourceType) && StringUtils.hasText(record.getPatternProductionId())) {
                patternProductionIds.add(record.getPatternProductionId());
            }
        }

        // 一次查询获取所有订单字段（原来是 5 次独立 listByIds 调用，现合并为 1 次）
        Map<String, Integer> orderQuantityMap = new HashMap<>();
        Map<String, String> orderColorMap = new HashMap<>();
        Map<String, String> orderFactoryNameMap = new HashMap<>();
        Map<String, String> orderFactoryTypeMap = new HashMap<>();
        Map<String, String> orderBizTypeMap = new HashMap<>();
        loadOrderFields(orderIds, orderQuantityMap, orderColorMap, orderFactoryNameMap, orderFactoryTypeMap, orderBizTypeMap);

        // 一次查询获取所有样版字段（quantity/color + 通过关联 ProductionOrder 补齐 factoryName/factoryType/orderBizType）
        Map<String, Integer> patternQuantityMap = new HashMap<>();
        Map<String, String> patternColorMap = new HashMap<>();
        Map<String, String> patternFactoryNameMap = new HashMap<>();
        Map<String, String> patternFactoryTypeMap = new HashMap<>();
        Map<String, String> patternOrderBizTypeMap = new HashMap<>();
        loadPatternFields(patternProductionIds, patternQuantityMap, patternColorMap,
                patternFactoryNameMap, patternFactoryTypeMap, patternOrderBizTypeMap);

        // 批量查询库存，按 materialCode|color|size 分组（1 次 SQL，避免 N+1）
        Map<String, List<MaterialStock>> stockCache = batchQueryStockByPurchases(records);

        List<Map<String, Object>> enrichedRecords = records.stream()
            .map(record -> enrichRecord(record, orderQuantityMap, patternQuantityMap, orderColorMap, patternColorMap,
                    orderFactoryNameMap, orderFactoryTypeMap, orderBizTypeMap,
                    patternFactoryNameMap, patternFactoryTypeMap, patternOrderBizTypeMap,
                    stockCache))
                .collect(Collectors.toList());

        // 批量注入款式封面图（采购详情/列表顶部卡片展示）
        injectStyleCover(records, enrichedRecords, ctxTenantId);

        return buildPageResult(enrichedRecords, page);
    }

    /**
     * 批量注入款式封面图（styleImage/coverImage）：按 styleNo 关联 StyleInfo.cover，
     * 与 CuttingTaskOrchestrator.injectStyleCover 同模式。失败不阻断列表主流程。
     */
    private void injectStyleCover(List<MaterialPurchase> records,
            List<Map<String, Object>> enrichedRecords, Long tenantId) {
        if (tenantId == null) return;
        Set<String> styleNos = records.stream()
                .map(MaterialPurchase::getStyleNo)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        if (styleNos.isEmpty()) return;
        try {
            Map<String, String> styleNoToCover = styleInfoService.lambdaQuery()
                    .select(com.fashion.supplychain.style.entity.StyleInfo::getStyleNo,
                            com.fashion.supplychain.style.entity.StyleInfo::getCover)
                    .in(com.fashion.supplychain.style.entity.StyleInfo::getStyleNo, styleNos)
                    .eq(com.fashion.supplychain.style.entity.StyleInfo::getTenantId, tenantId)
                    .list()
                    .stream()
                    .filter(s -> StringUtils.hasText(s.getStyleNo()) && StringUtils.hasText(s.getCover()))
                    .collect(Collectors.toMap(
                            com.fashion.supplychain.style.entity.StyleInfo::getStyleNo,
                            com.fashion.supplychain.style.entity.StyleInfo::getCover,
                            (v1, v2) -> v1));
            if (styleNoToCover.isEmpty()) return;
            for (int i = 0; i < enrichedRecords.size() && i < records.size(); i++) {
                String cover = styleNoToCover.get(records.get(i).getStyleNo());
                if (StringUtils.hasText(cover)) {
                    enrichedRecords.get(i).put("styleImage", cover);
                    enrichedRecords.get(i).put("coverImage", cover);
                }
            }
        } catch (Exception e) {
            log.warn("[采购列表] 款式封面注入失败(不阻断): {}", e.getMessage());
        }
    }

    /**
     * 一次查询获取所有需要的订单字段，替代原来 5 次独立 listByIds 调用。
     * 云端 DB 每次 RTT ~50ms，合并后节省约 200ms/请求。
     */
    private void loadOrderFields(Set<String> orderIds,
            Map<String, Integer> quantityMap, Map<String, String> colorMap,
            Map<String, String> factoryNameMap, Map<String, String> factoryTypeMap,
            Map<String, String> bizTypeMap) {
        if (orderIds.isEmpty()) return;
        try {
            List<ProductionOrder> orders = productionOrderService.listByIds(orderIds);
            for (ProductionOrder order : orders) {
                if (order == null || !StringUtils.hasText(order.getId())) continue;
                String id = order.getId();
                quantityMap.put(id, order.getOrderQuantity());
                colorMap.put(id, order.getColor());
                factoryNameMap.put(id, order.getFactoryName());
                factoryTypeMap.put(id, order.getFactoryType());
                bizTypeMap.put(id, order.getOrderBizType());
            }
        } catch (Exception e) {
            log.warn("Failed to load order fields for purchase enrichment", e);
        }
    }

    /**
     * 一次查询获取所有需要的样版字段。
     * 样版本身只有 quantity/color；factoryName/factoryType/orderBizType 通过关联的 ProductionOrder（productionOrderId）补齐。
     */
    private void loadPatternFields(Set<String> patternProductionIds,
            Map<String, Integer> quantityMap, Map<String, String> colorMap,
            Map<String, String> factoryNameMap, Map<String, String> factoryTypeMap,
            Map<String, String> orderBizTypeMap) {
        if (patternProductionIds.isEmpty()) return;
        try {
            List<PatternProduction> patterns = patternProductionService.listByIds(patternProductionIds);
            // 第一遍：填充 quantity/color，并收集所有关联的 ProductionOrder ID
            Set<String> relatedOrderIds = new HashSet<>();
            for (PatternProduction pattern : patterns) {
                if (pattern == null || !StringUtils.hasText(pattern.getId())) continue;
                String id = pattern.getId();
                quantityMap.put(id, pattern.getQuantity());
                colorMap.put(id, pattern.getColor());
                String orderId = pattern.getProductionOrderId();
                if (StringUtils.hasText(orderId)) {
                    relatedOrderIds.add(orderId);
                }
            }
            // 第二遍：批量查询关联的 ProductionOrder，回填 factoryName/factoryType/orderBizType
            if (!relatedOrderIds.isEmpty()) {
                List<ProductionOrder> orders = productionOrderService.listByIds(relatedOrderIds);
                Map<String, ProductionOrder> orderMap = new HashMap<>();
                for (ProductionOrder order : orders) {
                    if (order == null || !StringUtils.hasText(order.getId())) continue;
                    orderMap.put(order.getId(), order);
                }
                // 按 patternId 回填（一个订单可能关联多个样版）
                for (PatternProduction pattern : patterns) {
                    if (pattern == null || !StringUtils.hasText(pattern.getId())) continue;
                    String orderId = pattern.getProductionOrderId();
                    if (!StringUtils.hasText(orderId)) continue;
                    ProductionOrder order = orderMap.get(orderId);
                    if (order == null) continue;
                    String patternId = pattern.getId();
                    factoryNameMap.put(patternId, order.getFactoryName());
                    factoryTypeMap.put(patternId, order.getFactoryType());
                    orderBizTypeMap.put(patternId, order.getOrderBizType());
                }
            }
        } catch (Exception e) {
            log.warn("Failed to load pattern production fields for purchase enrichment", e);
        }
    }
    private Map<String, Object> enrichRecord(MaterialPurchase record,
            Map<String, Integer> orderQuantityMap, Map<String, Integer> patternQuantityMap,
            Map<String, String> orderColorMap, Map<String, String> patternColorMap,
            Map<String, String> orderFactoryNameMap, Map<String, String> orderFactoryTypeMap,
            Map<String, String> orderBizTypeMap,
            Map<String, String> patternFactoryNameMap, Map<String, String> patternFactoryTypeMap,
            Map<String, String> patternOrderBizTypeMap,
            Map<String, List<MaterialStock>> stockCache) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", record.getId());
        map.put("purchaseNo", record.getPurchaseNo());
        map.put("materialId", record.getMaterialId());
        map.put("materialCode", record.getMaterialCode());
        map.put("materialName", record.getMaterialName());
        map.put("materialType", record.getMaterialType());
        map.put("specifications", record.getSpecifications());
        // D-258：回填字段透传。queryPage 已通过 enrichFromMaterialDatabase + enrichMissingFromBom
        // 把资料库/BOM 的成分/克重/幅宽/颜色/尺码填进实体，但此处白名单未包含 → 前端永远收不到。
        map.put("color", record.getColor());
        map.put("size", record.getSize());
        map.put("fabricComposition", record.getFabricComposition());
        map.put("fabricWeight", record.getFabricWeight());
        map.put("fabricWidth", record.getFabricWidth());
        map.put("unit", record.getUnit());
        map.put("purchaseQuantity", record.getPurchaseQuantity());
        map.put("arrivedQuantity", record.getArrivedQuantity());
        map.put("supplierId", record.getSupplierId());
        map.put("supplierName", record.getSupplierName());
        map.put("unitPrice", record.getUnitPrice());
        map.put("totalAmount", record.getTotalAmount());
        map.put("receiverId", record.getReceiverId());
        map.put("receiverName", record.getReceiverName());
        map.put("receivedTime", record.getReceivedTime());
        map.put("remark", record.getRemark());
        map.put("orderId", record.getOrderId());
        map.put("orderNo", record.getOrderNo());
        map.put("styleId", record.getStyleId());
        map.put("styleNo", record.getStyleNo());
        map.put("styleName", record.getStyleName());
        map.put("styleCover", record.getStyleCover());
        map.put("returnConfirmed", record.getReturnConfirmed());
        map.put("returnQuantity", record.getReturnQuantity());
        map.put("returnConfirmerId", record.getReturnConfirmerId());
        map.put("returnConfirmerName", record.getReturnConfirmerName());
        map.put("returnConfirmTime", record.getReturnConfirmTime());
        map.put("status", record.getStatus());
        map.put("createTime", record.getCreateTime());
        map.put("updateTime", record.getUpdateTime());
        map.put("expectedArrivalDate", record.getExpectedArrivalDate());
        map.put("actualArrivalDate", record.getActualArrivalDate());
        map.put("expectedShipDate", record.getExpectedShipDate());
        map.put("sourceType", record.getSourceType());
        map.put("patternProductionId", record.getPatternProductionId());

        Integer orderQuantity = null;
        String orderColor = null;
        String factoryName = null;
        String factoryType = null;
        String orderBizType = null;
        String sourceType = record.getSourceType();
        if ("order".equals(sourceType) && StringUtils.hasText(record.getOrderId())) {
            orderQuantity = orderQuantityMap.get(record.getOrderId());
            orderColor = orderColorMap.get(record.getOrderId());
            factoryName = orderFactoryNameMap.get(record.getOrderId());
            factoryType = orderFactoryTypeMap.get(record.getOrderId());
            orderBizType = orderBizTypeMap.get(record.getOrderId());
        } else if ("sample".equals(sourceType) && StringUtils.hasText(record.getPatternProductionId())) {
            orderQuantity = patternQuantityMap.get(record.getPatternProductionId());
            orderColor = patternColorMap.get(record.getPatternProductionId());
            // factoryName/factoryType/orderBizType 通过 PatternProduction.productionOrderId 关联的 ProductionOrder 补齐
            factoryName = patternFactoryNameMap.get(record.getPatternProductionId());
            factoryType = patternFactoryTypeMap.get(record.getPatternProductionId());
            orderBizType = patternOrderBizTypeMap.get(record.getPatternProductionId());
        }
        map.put("orderQuantity", orderQuantity);
        map.put("orderColor", orderColor);
        map.put("factoryName", factoryName);
        map.put("factoryType", factoryType);
        map.put("orderBizType", orderBizType);
        // 孤儿单检测：sourceType=order 但父订单已被删除（不在 orderQuantityMap 中）
        boolean isOrphan = "order".equals(sourceType)
                && StringUtils.hasText(record.getOrderId())
                && !orderQuantityMap.containsKey(record.getOrderId());
        map.put("isOrphan", isOrphan);

        // 库存状态 + 可用库存数（按 materialCode + color + size 匹配，与 StyleBom 逻辑一致）
        String stockKey = buildStockKey(record.getMaterialCode(), record.getColor(), record.getSize());
        List<MaterialStock> stockList = stockCache.getOrDefault(stockKey, Collections.emptyList());
        int availableStock = calcAvailableStock(stockList);
        // 采购数量作为需求量（考虑已到货部分）
        BigDecimal purchaseQty = record.getPurchaseQuantity();
        int requiredQty = purchaseQty != null ? purchaseQty.intValue() : 0;
        String stockStatus;
        if (availableStock >= requiredQty && requiredQty > 0) {
            stockStatus = "sufficient";
        } else if (availableStock > 0) {
            stockStatus = "insufficient";
        } else {
            stockStatus = "none";
        }
        map.put("stockStatus", stockStatus);
        map.put("availableStock", availableStock);
        return map;
    }

    /**
     * 批量查询采购单关联的物料库存，按 materialCode|color|size 分组。
     * 1 次 SQL 查询所有 materialCode，避免 N+1。
     */
    private Map<String, List<MaterialStock>> batchQueryStockByPurchases(List<MaterialPurchase> purchases) {
        Set<String> materialCodes = purchases.stream()
                .map(MaterialPurchase::getMaterialCode)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        if (materialCodes.isEmpty()) {
            return Collections.emptyMap();
        }
        try {
            List<MaterialStock> allStocks = materialStockService.list(
                    new LambdaQueryWrapper<MaterialStock>()
                            .in(MaterialStock::getMaterialCode, materialCodes));
            return allStocks.stream()
                    .collect(Collectors.groupingBy(s -> buildStockKey(s.getMaterialCode(), s.getColor(), s.getSize())));
        } catch (Exception e) {
            log.warn("Failed to batch query stock for purchase list enrichment", e);
            return Collections.emptyMap();
        }
    }

    private String buildStockKey(String materialCode, String color, String size) {
        return (materialCode == null ? "" : materialCode) + "|"
                + (color == null ? "" : color) + "|"
                + (size == null ? "" : size);
    }

    private int calcAvailableStock(List<MaterialStock> stockList) {
        if (stockList == null || stockList.isEmpty()) {
            return 0;
        }
        return stockList.stream()
                .mapToInt(stock -> {
                    int qty = stock.getQuantity() != null ? stock.getQuantity() : 0;
                    int locked = stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0;
                    return Math.max(0, qty - locked);
                })
                .sum();
    }

    private Map<String, Object> buildPageResult(Object records, IPage<?> page) {
        Map<String, Object> result = new HashMap<>();
        result.put("records", records);
        result.put("total", page.getTotal());
        result.put("size", page.getSize());
        result.put("current", page.getCurrent());
        result.put("pages", page.getPages());
        return result;
    }

    /* ========== 需求批量计算 ========== */

    public List<String> resolveTargetOrderIds(ProductionOrder seed, boolean overwrite) {
        return resolveTargetOrderIds(seed, overwrite, false);
    }

    /**
     * shortageOnly=true 时为增量补货：不剔除"已存在采购记录"的订单
     * （物料级去重由 filterAndApplyShortage 负责），否则核心场景恒返回空列表。
     */
    public List<String> resolveTargetOrderIds(ProductionOrder seed, boolean overwrite, boolean shortageOnly) {
        List<ProductionOrder> matchedOrders = resolveSameDaySameStyleOrders(seed);
        List<String> out = new ArrayList<>();

        // 批量预加载已存在 active purchase 的 orderId 集合（修复 N+1 查询）
        // active 定义与 existsActivePurchaseForOrder 一致：deleteFlag=0
        Set<String> existingOrderIds;
        if (overwrite) {
            existingOrderIds = Collections.emptySet();
        } else {
            Set<String> candidateIds = matchedOrders.stream()
                    .filter(o -> o != null && StringUtils.hasText(o.getId()))
                    .map(o -> o.getId().trim())
                    .collect(Collectors.toSet());
            if (candidateIds.isEmpty()) {
                existingOrderIds = Collections.emptySet();
            } else {
                existingOrderIds = new HashSet<>(materialPurchaseService.lambdaQuery()
                        .select(MaterialPurchase::getOrderId)
                        .in(MaterialPurchase::getOrderId, candidateIds)
                        .eq(MaterialPurchase::getDeleteFlag, 0)
                        .list()
                        .stream()
                        .map(p -> p.getOrderId() != null ? p.getOrderId().trim() : null)
                        .filter(StringUtils::hasText)
                        .collect(Collectors.toSet()));
            }
        }

        for (ProductionOrder o : matchedOrders) {
            if (o == null || !StringUtils.hasText(o.getId())) continue;
            String oid = o.getId().trim();
            if (!StringUtils.hasText(oid)) continue;
            if (!overwrite && !shortageOnly && existingOrderIds.contains(oid)) continue;
            out.add(oid);
        }
        return out;
    }

    public List<MaterialPurchase> buildBatchPreview(List<String> orderIds) {
        List<MaterialPurchase> out = new ArrayList<>();
        if (orderIds == null || orderIds.isEmpty()) return out;

        LinkedHashMap<String, String> purchaseNoByKey = new LinkedHashMap<>();
        for (String idRaw : orderIds) {
            String id = StringUtils.hasText(idRaw) ? idRaw.trim() : null;
            if (!StringUtils.hasText(id)) continue;
            List<MaterialPurchase> items = materialPurchaseService.previewDemandByOrderId(id);
            if (items == null || items.isEmpty()) continue;
            for (MaterialPurchase p : items) {
                if (p == null) continue;
                String key = mergeKey(p);
                String shared = purchaseNoByKey.get(key);
                if (!StringUtils.hasText(shared)) {
                    shared = p.getPurchaseNo();
                    if (StringUtils.hasText(shared)) purchaseNoByKey.put(key, shared);
                } else {
                    p.setPurchaseNo(shared);
                }
                out.add(p);
            }
        }
        return out;
    }

    public List<MaterialPurchase> generateBatchDemand(List<String> orderIds, boolean overwrite) {
        return generateBatchDemand(orderIds, overwrite, false);
    }

    /**
     * 批量生成采购需求。
     * shortageOnly=true 时只生成缺料部分：口径与智能采购推荐一致
     * （净需求 = 采购数量 − 可用库存 − 在途），净需求 ≤ 0 跳过，
     * 缺料的采购数量按净需求生成；该订单已有同物料活跃采购的也跳过（防重复补货）。
     */
    public List<MaterialPurchase> generateBatchDemand(List<String> orderIds, boolean overwrite, boolean shortageOnly) {
        List<MaterialPurchase> out = new ArrayList<>();
        if (orderIds == null || orderIds.isEmpty()) return out;

        if (overwrite) {
            LocalDateTime now = LocalDateTime.now();
            for (String idRaw : orderIds) {
                String oid = StringUtils.hasText(idRaw) ? idRaw.trim() : null;
                if (!StringUtils.hasText(oid)) continue;
                materialPurchaseService.remove(new LambdaQueryWrapper<MaterialPurchase>()
                        .eq(MaterialPurchase::getOrderId, oid));
            }
        }

        LinkedHashMap<String, String> purchaseNoByKey = new LinkedHashMap<>();
        for (String idRaw : orderIds) {
            String oid = StringUtils.hasText(idRaw) ? idRaw.trim() : null;
            if (!StringUtils.hasText(oid)) continue;
            List<MaterialPurchase> items = materialPurchaseService.previewDemandByOrderId(oid);
            if (items == null || items.isEmpty()) continue;
            for (MaterialPurchase p : items) {
                if (p == null) continue;
                if (shortageOnly && !filterAndApplyShortage(p, oid)) continue;
                String key = mergeKey(p);
                String shared = purchaseNoByKey.get(key);
                if (!StringUtils.hasText(shared)) {
                    shared = p.getPurchaseNo();
                    if (StringUtils.hasText(shared)) purchaseNoByKey.put(key, shared);
                } else {
                    p.setPurchaseNo(shared);
                }
                boolean ok = materialPurchaseService.savePurchaseAndUpdateOrder(p);
                if (ok) out.add(p);
            }
        }
        return out;
    }

    /**
     * 仅缺料过滤：净需求 = 采购数量 − 可用库存 − 在途（活跃采购未到货部分）。
     * 通过过滤时把采购数量改写为净需求，并同步重算 totalAmount。
     */
    private boolean filterAndApplyShortage(MaterialPurchase p, String orderId) {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        String materialCode = p.getMaterialCode();
        if (!StringUtils.hasText(materialCode)) {
            return true; // 无法定位物料时不过滤，保持全量行为
        }
        BigDecimal qty = p.getPurchaseQuantity() != null ? p.getPurchaseQuantity() : BigDecimal.ZERO;

        // 该订单已有同物料活跃采购（未完成/未取消）→ 已覆盖或在途，跳过
        long activeCount = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getOrderId, orderId)
                .eq(MaterialPurchase::getMaterialCode, materialCode)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .notIn(MaterialPurchase::getStatus, "completed", "cancelled")
                .count();
        if (activeCount > 0) return false;

        // 可用库存 = Σ(quantity − lockedQuantity)，口径同 SmartSourcingServiceImpl
        List<MaterialStock> stocks = materialStockService.lambdaQuery()
                .eq(MaterialStock::getMaterialCode, materialCode)
                .eq(MaterialStock::getTenantId, tenantId)
                .eq(MaterialStock::getDeleteFlag, 0)
                .list();
        BigDecimal available = stocks.stream()
                .map(st -> BigDecimal.valueOf(
                        (st.getQuantity() != null ? st.getQuantity() : 0)
                                - (st.getLockedQuantity() != null ? st.getLockedQuantity() : 0)))
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .max(BigDecimal.ZERO);

        // 在途 = Σ(purchaseQuantity − arrivedQuantity)，活跃采购
        BigDecimal inTransit = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getMaterialCode, materialCode)
                .eq(MaterialPurchase::getTenantId, tenantId)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .notIn(MaterialPurchase::getStatus, "completed", "cancelled")
                .list().stream()
                .map(x -> {
                    BigDecimal purchased = x.getPurchaseQuantity() != null ? x.getPurchaseQuantity() : BigDecimal.ZERO;
                    int arrived = x.getArrivedQuantity() != null ? x.getArrivedQuantity() : 0;
                    return purchased.subtract(BigDecimal.valueOf(arrived)).max(BigDecimal.ZERO);
                })
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal net = qty.subtract(available).subtract(inTransit).max(BigDecimal.ZERO);
        if (net.compareTo(BigDecimal.ZERO) <= 0) return false;
        p.setPurchaseQuantity(net);
        if (p.getUnitPrice() != null && p.getTotalAmount() != null) {
            p.setTotalAmount(net.multiply(p.getUnitPrice()));
        }
        return true;
    }

    public List<ProductionOrder> resolveSameDaySameStyleOrders(ProductionOrder seed) {
        if (seed == null || !StringUtils.hasText(seed.getId())) return List.of();

        String seedId = seed.getId().trim();
        String styleId = StringUtils.hasText(seed.getStyleId()) ? seed.getStyleId().trim() : null;
        if (!StringUtils.hasText(styleId)) return List.of(seed);

        // 优先从 orderNo 提取日期（格式 PO20260228001），彻底避免时区污染的 createTime 问题
        // 历史数据 createTime 使用 UTC 存储，导致同一自然日的不同订单跨天匹配；
        // orderNo 中的日期是创建时按北京时间写入的，可靠性更高
        String seedOrderNo = StringUtils.hasText(seed.getOrderNo()) ? seed.getOrderNo().trim() : "";
        LocalDate day = extractDateFromOrderNo(seedOrderNo);
        if (day == null) {
            // 回退到 createTime（时区修复后的新订单该值可靠）
            LocalDateTime createTime = seed.getCreateTime();
            if (createTime == null) return List.of(seed);
            day = createTime.toLocalDate();
        }

        // 构造 orderNo 日期前缀，例如 "PO20260228"
        // likeRight 仅匹配该自然日内的订单，不受 createTime 存储时区影响
        String orderNoPrefix = "PO" + String.format("%d%02d%02d",
                day.getYear(), day.getMonthValue(), day.getDayOfMonth());

        List<ProductionOrder> list = productionOrderService.list(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getStyleId, styleId)
                .likeRight(ProductionOrder::getOrderNo, orderNoPrefix)
                .orderByAsc(ProductionOrder::getOrderNo));

        if (list == null || list.isEmpty()) return List.of(seed);

        LinkedHashMap<String, ProductionOrder> dedup = new LinkedHashMap<>();
        for (ProductionOrder o : list) {
            if (o == null || !StringUtils.hasText(o.getId())) continue;
            String id = o.getId().trim();
            if (!StringUtils.hasText(id)) continue;
            dedup.put(id, o);
        }
        if (!dedup.containsKey(seedId)) dedup.put(seedId, seed);
        return new ArrayList<>(dedup.values());
    }

    /**
     * 从订单号中提取日期。
     * 订单号格式：PO + YYYYMMDD + 序号（如 PO20260228001）
     * 返回 null 表示解析失败，调用方应回退到 createTime
     */
    private LocalDate extractDateFromOrderNo(String orderNo) {
        if (!StringUtils.hasText(orderNo)) return null;
        try {
            // 去掉开头的字母前缀，取后面的 8 位日期数字
            String digits = orderNo.replaceAll("^[A-Za-z]+", "");
            if (digits.length() >= 8) {
                int year  = Integer.parseInt(digits.substring(0, 4));
                int month = Integer.parseInt(digits.substring(4, 6));
                int dom   = Integer.parseInt(digits.substring(6, 8));
                return LocalDate.of(year, month, dom);
            }
        } catch (Exception e) {
            log.debug("无法从 orderNo 解析日期: {}", orderNo);
        }
        return null;
    }

    /* ========== BOM 单价填充 ========== */

    public void fillUnitPriceFromBom(MaterialPurchase purchase) {
        if (purchase == null) return;
        if (purchase.getUnitPrice() != null && purchase.getUnitPrice().compareTo(java.math.BigDecimal.ZERO) > 0) return;
        if (!StringUtils.hasText(purchase.getStyleId()) || !StringUtils.hasText(purchase.getMaterialCode())) return;
        try {
            Long styleId = Long.valueOf(purchase.getStyleId().trim());
            String materialCode = purchase.getMaterialCode().trim();
            StyleBom bom = styleBomService.lambdaQuery()
                    .eq(StyleBom::getStyleId, styleId)
                    .eq(StyleBom::getMaterialCode, materialCode)
                    .one();
            if (bom != null && bom.getUnitPrice() != null
                    && bom.getUnitPrice().compareTo(java.math.BigDecimal.ZERO) > 0) {
                purchase.setUnitPrice(bom.getUnitPrice());
                log.info("从BOM填充单价: materialCode={}, unitPrice={}", materialCode, bom.getUnitPrice());
            }
        } catch (Exception e) {
            log.warn("从BOM填充单价失败: styleId={}, materialCode={}", purchase.getStyleId(), purchase.getMaterialCode(), e);
        }
    }

    /* ========== 订单状态同步 ========== */

    public void ensureOrderStatusProduction(String orderId) {
        if (!StringUtils.hasText(orderId)) return;
        String oid = orderId.trim();
        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || (order.getDeleteFlag() != null && order.getDeleteFlag() != 0)) return;
        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("completed".equalsIgnoreCase(st) || "production".equalsIgnoreCase(st)) return;
        ProductionOrder patch = new ProductionOrder();
        patch.setId(oid);
        patch.setStatus("production");
        patch.setUpdateTime(LocalDateTime.now());
        productionOrderService.updateById(patch);
    }

    public void recomputeAndUpdateMaterialArrivalRate(String orderId,
            ProductionOrderOrchestrator productionOrderOrchestrator) {
        if (!StringUtils.hasText(orderId)) return;
        String oid = orderId.trim();
        MaterialPurchaseService.ArrivalStats stats = materialPurchaseService.computeArrivalStatsByOrderId(oid);
        int rate = stats == null ? 0 : stats.getArrivalRate();
        productionOrderOrchestrator.updateMaterialArrivalRate(oid, rate);
    }

    /* ========== 扫码订单号标准化 ========== */

    public String normalizeOrderNo(String code) {
        if (!StringUtils.hasText(code)) return null;
        String trimmed = code.trim();
        if (trimmed.startsWith("PO")) return trimmed;
        if (trimmed.startsWith("P0")) return "PO" + trimmed.substring(2);
        if (trimmed.startsWith("CUT")) return trimmed;
        if (trimmed.startsWith("ORD")) return trimmed;
        return null;
    }

    /* ========== 同日同款面辅料合并采购查询 ========== */

    /**
     * 查找当天同款面辅料的可合并采购任务
     * 匹配条件：同一天创建 + 相同物料编码(或物料名称+规格+类型) + 状态为pending
     * 排除指定的采购任务ID列表
     */
    public List<MaterialPurchase> findMergeablePurchases(MaterialPurchase seed, List<String> excludeIds) {
        if (seed == null) return List.of();

        LocalDateTime createTime = seed.getCreateTime();
        if (createTime == null) createTime = LocalDateTime.now();

        LocalDate day = createTime.toLocalDate();
        LocalDateTime dayStart = day.atStartOfDay();
        LocalDateTime nextDayStart = day.plusDays(1).atStartOfDay();

        String materialCode = safe(seed.getMaterialCode());
        String materialName = safe(seed.getMaterialName());
        String materialType = safe(seed.getMaterialType());
        String specifications = safe(seed.getSpecifications());
        String sourceType = safe(seed.getSourceType());
        String seedColor = safe(seed.getColor());

        LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(MaterialPurchase::getStatus, MaterialConstants.STATUS_PENDING)
                .ge(MaterialPurchase::getCreateTime, dayStart)
                .lt(MaterialPurchase::getCreateTime, nextDayStart);

        if (StringUtils.hasText(sourceType)) {
            wrapper.eq(MaterialPurchase::getSourceType, sourceType);
        } else {
            wrapper.and(w -> w.isNull(MaterialPurchase::getSourceType).or().eq(MaterialPurchase::getSourceType, ""));
        }

        if (StringUtils.hasText(seedColor)) {
            wrapper.eq(MaterialPurchase::getColor, seedColor);
        } else {
            wrapper.and(w -> w.isNull(MaterialPurchase::getColor).or().eq(MaterialPurchase::getColor, ""));
        }

        if (StringUtils.hasText(materialCode)) {
            wrapper.eq(MaterialPurchase::getMaterialCode, materialCode);
        } else if (StringUtils.hasText(materialName)) {
            wrapper.eq(MaterialPurchase::getMaterialName, materialName)
                    .eq(MaterialPurchase::getMaterialType, materialType);
            if (StringUtils.hasText(specifications)) {
                wrapper.eq(MaterialPurchase::getSpecifications, specifications);
            }
        } else {
            return List.of();
        }

        wrapper.orderByAsc(MaterialPurchase::getCreateTime);
        wrapper.last("LIMIT 5000");
        List<MaterialPurchase> all = materialPurchaseService.list(wrapper);
        if (all == null || all.isEmpty()) return List.of();

        // 排除指定ID
        Set<String> excludeSet = new HashSet<>();
        if (excludeIds != null) {
            for (String id : excludeIds) {
                if (StringUtils.hasText(id)) excludeSet.add(id.trim());
            }
        }

        return all.stream()
                .filter(p -> p != null && StringUtils.hasText(p.getId()))
                .filter(p -> !excludeSet.contains(p.getId().trim()))
                .collect(Collectors.toList());
    }

    /**
     * 根据一条采购任务ID，查找当天所有可合并的同款面辅料采购任务
     * 返回：该条记录本身 + 其他可合并的pending记录
     */
    public Map<String, Object> checkMergeableForReceive(String purchaseId) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("currentId", purchaseId);
        result.put("mergeableItems", List.of());
        result.put("mergeableCount", 0);

        if (!StringUtils.hasText(purchaseId)) return result;

        MaterialPurchase current = materialPurchaseService.getById(purchaseId.trim());
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            return result;
        }

        List<MaterialPurchase> mergeable = findMergeablePurchases(current, List.of(purchaseId.trim()));
        if (mergeable.isEmpty()) return result;

        // 构建简要信息返回给前端
        List<Map<String, Object>> items = new ArrayList<>();
        for (MaterialPurchase p : mergeable) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", p.getId());
            item.put("purchaseNo", p.getPurchaseNo());
            item.put("materialCode", p.getMaterialCode());
            item.put("materialName", p.getMaterialName());
            item.put("materialType", p.getMaterialType());
            item.put("specifications", p.getSpecifications());
            item.put("purchaseQuantity", p.getPurchaseQuantity());
            item.put("unit", p.getUnit());
            item.put("unitPrice", p.getUnitPrice());
            item.put("orderNo", p.getOrderNo());
            item.put("styleNo", p.getStyleNo());
            item.put("styleName", p.getStyleName());
            item.put("supplierName", p.getSupplierName());
            item.put("createTime", p.getCreateTime());
            items.add(item);
        }

        result.put("mergeableItems", items);
        result.put("mergeableCount", items.size());
        return result;
    }

    /* ========== 工具方法 ========== */

    public String mergeKey(MaterialPurchase p) {
        if (p == null) return "";
        return String.join("|",
                safe(p.getMaterialType()), safe(p.getMaterialCode()), safe(p.getMaterialName()),
                safe(p.getSpecifications()), safe(p.getColor()), safe(p.getUnit()), safe(p.getSupplierName()));
    }

    public String safe(String v) {
        return v == null ? "" : v.trim();
    }

    public List<String> coerceStringList(Object raw) {
        if (raw == null) return List.of();
        if (raw instanceof List<?> list) {
            List<String> out = new ArrayList<>();
            for (Object o : list) {
                if (o == null) continue;
                String s = String.valueOf(o);
                if (StringUtils.hasText(s)) out.add(s.trim());
            }
            return out;
        }
        String s = String.valueOf(raw);
        if (!StringUtils.hasText(s)) return List.of();
        String[] parts = s.split("[,，\\s]+");
        List<String> out = new ArrayList<>();
        for (String p : parts) {
            if (StringUtils.hasText(p)) out.add(p.trim());
        }
        return out;
    }

    public Integer coerceInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number number) return number.intValue();
        String s = String.valueOf(v).trim();
        if (!StringUtils.hasText(s)) return null;
        try { return Integer.valueOf(s); } catch (Exception e) { log.debug("[MaterialPurchase] coerceInt失败: {}", s); return null; }
    }

    public java.math.BigDecimal coerceBigDecimal(Object v) {
        if (v == null) return null;
        if (v instanceof java.math.BigDecimal bd) return bd.setScale(4, java.math.RoundingMode.HALF_UP);
        if (v instanceof Number number) return java.math.BigDecimal.valueOf(number.doubleValue()).setScale(4, java.math.RoundingMode.HALF_UP);
        String s = String.valueOf(v).trim();
        if (!StringUtils.hasText(s)) return null;
        try { return new java.math.BigDecimal(s).setScale(4, java.math.RoundingMode.HALF_UP); } catch (Exception e) { log.debug("[MaterialPurchase] coerceBigDecimal失败: {}", s); return null; }
    }
}
