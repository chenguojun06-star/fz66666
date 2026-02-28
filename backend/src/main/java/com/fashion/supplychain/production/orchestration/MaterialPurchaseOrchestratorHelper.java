package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
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

    /* ========== 列表富化 ========== */

    /**
     * 查询采购列表并补充 orderQuantity 字段
     */
    public Map<String, Object> listWithEnrichment(Map<String, Object> params) {
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

        Map<String, Integer> orderQuantityMap = loadOrderQuantities(orderIds);
        Map<String, Integer> patternQuantityMap = loadPatternQuantities(patternProductionIds);
        Map<String, String> orderColorMap = loadOrderColors(orderIds);
        Map<String, String> patternColorMap = loadPatternColors(patternProductionIds);

        List<Map<String, Object>> enrichedRecords = records.stream()
            .map(record -> enrichRecord(record, orderQuantityMap, patternQuantityMap, orderColorMap, patternColorMap))
                .collect(Collectors.toList());

        return buildPageResult(enrichedRecords, page);
    }

    private Map<String, Integer> loadOrderQuantities(Set<String> orderIds) {
        Map<String, Integer> map = new HashMap<>();
        if (orderIds.isEmpty()) return map;
        try {
            List<ProductionOrder> orders = productionOrderService.listByIds(orderIds);
            for (ProductionOrder order : orders) {
                if (order != null && StringUtils.hasText(order.getId())) {
                    map.put(order.getId(), order.getOrderQuantity());
                }
            }
        } catch (Exception e) {
            log.warn("Failed to load order quantities", e);
        }
        return map;
    }

    private Map<String, Integer> loadPatternQuantities(Set<String> patternProductionIds) {
        Map<String, Integer> map = new HashMap<>();
        if (patternProductionIds.isEmpty()) return map;
        try {
            List<PatternProduction> patterns = patternProductionService.listByIds(patternProductionIds);
            for (PatternProduction pattern : patterns) {
                if (pattern != null && StringUtils.hasText(pattern.getId())) {
                    map.put(pattern.getId(), pattern.getQuantity());
                }
            }
        } catch (Exception e) {
            log.warn("Failed to load pattern production quantities", e);
        }
        return map;
    }

    private Map<String, String> loadOrderColors(Set<String> orderIds) {
        Map<String, String> map = new HashMap<>();
        if (orderIds.isEmpty()) return map;
        try {
            List<ProductionOrder> orders = productionOrderService.listByIds(orderIds);
            for (ProductionOrder order : orders) {
                if (order != null && StringUtils.hasText(order.getId())) {
                    map.put(order.getId(), order.getColor());
                }
            }
        } catch (Exception e) {
            log.warn("Failed to load order colors", e);
        }
        return map;
    }

    private Map<String, String> loadPatternColors(Set<String> patternProductionIds) {
        Map<String, String> map = new HashMap<>();
        if (patternProductionIds.isEmpty()) return map;
        try {
            List<PatternProduction> patterns = patternProductionService.listByIds(patternProductionIds);
            for (PatternProduction pattern : patterns) {
                if (pattern != null && StringUtils.hasText(pattern.getId())) {
                    map.put(pattern.getId(), pattern.getColor());
                }
            }
        } catch (Exception e) {
            log.warn("Failed to load pattern production colors", e);
        }
        return map;
    }

    private Map<String, Object> enrichRecord(MaterialPurchase record,
            Map<String, Integer> orderQuantityMap, Map<String, Integer> patternQuantityMap,
            Map<String, String> orderColorMap, Map<String, String> patternColorMap) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", record.getId());
        map.put("purchaseNo", record.getPurchaseNo());
        map.put("materialId", record.getMaterialId());
        map.put("materialCode", record.getMaterialCode());
        map.put("materialName", record.getMaterialName());
        map.put("materialType", record.getMaterialType());
        map.put("specifications", record.getSpecifications());
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
        String sourceType = record.getSourceType();
        if ("order".equals(sourceType) && StringUtils.hasText(record.getOrderId())) {
            orderQuantity = orderQuantityMap.get(record.getOrderId());
            orderColor = orderColorMap.get(record.getOrderId());
        } else if ("sample".equals(sourceType) && StringUtils.hasText(record.getPatternProductionId())) {
            orderQuantity = patternQuantityMap.get(record.getPatternProductionId());
            orderColor = patternColorMap.get(record.getPatternProductionId());
        }
        map.put("orderQuantity", orderQuantity);
        map.put("orderColor", orderColor);
        return map;
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
        List<ProductionOrder> matchedOrders = resolveSameDaySameStyleOrders(seed);
        List<String> out = new ArrayList<>();
        for (ProductionOrder o : matchedOrders) {
            if (o == null || !StringUtils.hasText(o.getId())) continue;
            String oid = o.getId().trim();
            if (!StringUtils.hasText(oid)) continue;
            if (!overwrite && materialPurchaseService.existsActivePurchaseForOrder(oid)) continue;
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
        List<MaterialPurchase> out = new ArrayList<>();
        if (orderIds == null || orderIds.isEmpty()) return out;

        if (overwrite) {
            LocalDateTime now = LocalDateTime.now();
            for (String idRaw : orderIds) {
                String oid = StringUtils.hasText(idRaw) ? idRaw.trim() : null;
                if (!StringUtils.hasText(oid)) continue;
                MaterialPurchase patch = new MaterialPurchase();
                patch.setDeleteFlag(1);
                patch.setUpdateTime(now);
                materialPurchaseService.update(patch, new LambdaQueryWrapper<MaterialPurchase>()
                        .eq(MaterialPurchase::getOrderId, oid)
                        .eq(MaterialPurchase::getDeleteFlag, 0));
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

        // 查找同天创建的、状态为pending的采购任务
        LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(MaterialPurchase::getStatus, MaterialConstants.STATUS_PENDING)
                .ge(MaterialPurchase::getCreateTime, dayStart)
                .lt(MaterialPurchase::getCreateTime, nextDayStart);

        // 强制同来源链路合并：样衣(sample)与大货(order/batch/manual/stock)不互相混入
        if (StringUtils.hasText(sourceType)) {
            wrapper.eq(MaterialPurchase::getSourceType, sourceType);
        } else {
            wrapper.and(w -> w.isNull(MaterialPurchase::getSourceType).or().eq(MaterialPurchase::getSourceType, ""));
        }

        // 按物料编码或（物料名称+规格+类型）匹配
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
        try { return Integer.valueOf(s); } catch (Exception e) { return null; }
    }
}
