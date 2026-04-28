package com.fashion.supplychain.style.helper;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.stock.mapper.SampleStockMapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleOperationLogService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class StyleListEnrichmentHelper {

    private static final String STYLE_STATUS_SCRAPPED = "SCRAPPED";

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private com.fashion.supplychain.production.service.ProductWarehousingService productWarehousingService;

    @Autowired
    private StyleQuotationService styleQuotationService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleOperationLogService styleOperationLogService;

    @Autowired
    private SampleStockMapper sampleStockMapper;

    public void fillOrderCountFields(List<StyleInfo> records) {
        if (records == null || records.isEmpty()) return;
        Long readableTenantId = resolveReadableTenantId();
        boolean tenantScopedRead = isTenantScopedRead();

        java.util.List<String> styleIds = new java.util.ArrayList<>();
        java.util.Set<String> styleNos = new HashSet<>();
        for (StyleInfo s : records) {
            if (s == null) continue;
            if (s.getId() != null) styleIds.add(String.valueOf(s.getId()));
            if (StringUtils.hasText(s.getStyleNo())) styleNos.add(s.getStyleNo().trim());
        }
        if (styleIds.isEmpty() && styleNos.isEmpty()) return;

        java.util.Map<String, Integer> countByStyleId = new java.util.HashMap<>();
        java.util.Map<String, Integer> countByStyleNo = new java.util.HashMap<>();
        java.util.Map<String, Integer> quantityByStyleId = new java.util.HashMap<>();
        java.util.Map<String, Integer> quantityByStyleNo = new java.util.HashMap<>();

        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.select("style_id as styleId", "style_no as styleNo", "count(1) as cnt", "COALESCE(SUM(order_quantity), 0) as totalQty")
                .eq(tenantScopedRead, "tenant_id", readableTenantId)
                .and(w -> {
                    boolean hasPrev = false;
                    if (!styleIds.isEmpty()) { w.in("style_id", styleIds); hasPrev = true; }
                    if (!styleNos.isEmpty()) { if (hasPrev) w.or(); w.in("style_no", styleNos); }
                })
                .and(w -> w.isNull("delete_flag").or().eq("delete_flag", 0))
                .groupBy("style_id", "style_no");
        try {
            List<Map<String, Object>> rows = productionOrderService.listMaps(qw);
            for (Map<String, Object> r : rows) {
                if (r == null) continue;
                String sid = r.get("styleId") == null ? null : String.valueOf(r.get("styleId")).trim();
                String sno = r.get("styleNo") == null ? null : String.valueOf(r.get("styleNo")).trim();
                int cnt = r.get("cnt") == null ? 0 : Integer.parseInt(String.valueOf(r.get("cnt")));
                int totalQty = r.get("totalQty") == null ? 0 : Integer.parseInt(String.valueOf(r.get("totalQty")));
                if (cnt <= 0) continue;
                if (StringUtils.hasText(sid)) { countByStyleId.put(sid, cnt); quantityByStyleId.put(sid, totalQty); }
                if (StringUtils.hasText(sno)) { countByStyleNo.put(sno, cnt); quantityByStyleNo.put(sno, totalQty); }
            }
        } catch (Exception e) {
            log.warn("fillOrderCountFields 查询订单统计异常: {}", e.getMessage());
            return;
        }

        java.util.Map<String, LocalDateTime> latestOrderTimeByStyleId = new java.util.HashMap<>();
        java.util.Map<String, LocalDateTime> latestOrderTimeByStyleNo = new java.util.HashMap<>();
        java.util.Map<String, String> latestOrderCreatorByStyleId = new java.util.HashMap<>();
        java.util.Map<String, String> latestOrderCreatorByStyleNo = new java.util.HashMap<>();

        QueryWrapper<ProductionOrder> timeQw = new QueryWrapper<>();
        timeQw.select("style_id as styleId", "style_no as styleNo", "MAX(create_time) as latestTime",
                     "(SELECT created_by_name FROM t_production_order po2 WHERE " +
                     "(po2.style_id = t_production_order.style_id OR po2.style_no = t_production_order.style_no) " +
                    (tenantScopedRead ? ("AND po2.tenant_id = " + readableTenantId + " ") : "") +
                     "AND (po2.delete_flag IS NULL OR po2.delete_flag = 0) " +
                     "ORDER BY po2.create_time DESC LIMIT 1) as latestCreator")
                    .eq(tenantScopedRead, "tenant_id", readableTenantId)
                    .and(w -> {
                        boolean hasPrev = false;
                        if (!styleIds.isEmpty()) { w.in("style_id", styleIds); hasPrev = true; }
                        if (!styleNos.isEmpty()) { if (hasPrev) w.or(); w.in("style_no", styleNos); }
                    })
                    .and(w -> w.isNull("delete_flag").or().eq("delete_flag", 0))
                    .groupBy("style_id", "style_no");
        try {
            List<Map<String, Object>> timeRows = productionOrderService.listMaps(timeQw);
            for (Map<String, Object> r : timeRows) {
                if (r == null) continue;
                String sid = r.get("styleId") == null ? null : String.valueOf(r.get("styleId")).trim();
                String sno = r.get("styleNo") == null ? null : String.valueOf(r.get("styleNo")).trim();
                Object latestTimeObj = r.get("latestTime");
                LocalDateTime latestTime = null;
                if (latestTimeObj instanceof LocalDateTime) latestTime = (LocalDateTime) latestTimeObj;
                else if (latestTimeObj instanceof java.sql.Timestamp) latestTime = ((java.sql.Timestamp) latestTimeObj).toLocalDateTime();
                String latestCreator = r.get("latestCreator") == null ? null : String.valueOf(r.get("latestCreator")).trim();
                if (latestTime != null) {
                    if (StringUtils.hasText(sid)) { latestOrderTimeByStyleId.put(sid, latestTime); if (StringUtils.hasText(latestCreator)) latestOrderCreatorByStyleId.put(sid, latestCreator); }
                    if (StringUtils.hasText(sno)) { latestOrderTimeByStyleNo.put(sno, latestTime); if (StringUtils.hasText(latestCreator)) latestOrderCreatorByStyleNo.put(sno, latestCreator); }
                }
            }
        } catch (Exception e) {
            log.warn("fillOrderCountFields 查询最新下单时间异常: {}", e.getMessage());
        }

        for (StyleInfo s : records) {
            if (s == null) continue;
            String idKey = s.getId() == null ? null : String.valueOf(s.getId());
            Integer byId = StringUtils.hasText(idKey) ? countByStyleId.get(idKey) : null;
            if (byId != null && byId > 0) {
                s.setOrderCount(byId);
                s.setTotalOrderQuantity(quantityByStyleId.get(idKey));
                if (StringUtils.hasText(idKey)) { s.setLatestOrderTime(latestOrderTimeByStyleId.get(idKey)); s.setLatestOrderCreator(latestOrderCreatorByStyleId.get(idKey)); }
                continue;
            }
            String sno = StringUtils.hasText(s.getStyleNo()) ? s.getStyleNo().trim() : null;
            s.setOrderCount(StringUtils.hasText(sno) ? countByStyleNo.getOrDefault(sno, 0) : 0);
            s.setTotalOrderQuantity(StringUtils.hasText(sno) ? quantityByStyleNo.getOrDefault(sno, 0) : 0);
            if (StringUtils.hasText(sno)) { s.setLatestOrderTime(latestOrderTimeByStyleNo.get(sno)); s.setLatestOrderCreator(latestOrderCreatorByStyleNo.get(sno)); }
        }
    }

    public void fillScrapFields(List<StyleInfo> records) {
        if (records == null || records.isEmpty()) return;
        Long readableTenantId = resolveReadableTenantId();
        boolean tenantScopedRead = isTenantScopedRead();

        java.util.List<String> styleIds = new java.util.ArrayList<>();
        java.util.Set<String> styleNos = new HashSet<>();
        for (StyleInfo s : records) {
            if (s == null) continue;
            if (s.getId() != null) styleIds.add(String.valueOf(s.getId()));
            if (StringUtils.hasText(s.getStyleNo())) styleNos.add(s.getStyleNo().trim());
        }
        if (styleIds.isEmpty() && styleNos.isEmpty()) return;

        QueryWrapper<com.fashion.supplychain.production.entity.ProductWarehousing> qw = new QueryWrapper<>();
        qw.select("style_id as styleId", "style_no as styleNo", "COALESCE(SUM(unqualified_quantity), 0) as scrapQty")
            .eq(tenantScopedRead, "tenant_id", readableTenantId)
                .eq("repair_status", "scrapped")
                .and(w -> w.isNull("delete_flag").or().eq("delete_flag", 0))
                .and(w -> {
                    boolean hasPrev = false;
                    if (!styleIds.isEmpty()) { w.in("style_id", styleIds); hasPrev = true; }
                    if (!styleNos.isEmpty()) { if (hasPrev) w.or(); w.in("style_no", styleNos); }
                })
                .groupBy("style_id", "style_no");

        java.util.Map<String, Integer> scrapByStyleId = new java.util.HashMap<>();
        java.util.Map<String, Integer> scrapByStyleNo = new java.util.HashMap<>();
        try {
            List<Map<String, Object>> rows = productWarehousingService.listMaps(qw);
            for (Map<String, Object> r : rows) {
                if (r == null) continue;
                String sid = r.get("styleId") == null ? null : String.valueOf(r.get("styleId")).trim();
                String sno = r.get("styleNo") == null ? null : String.valueOf(r.get("styleNo")).trim();
                int qty = r.get("scrapQty") == null ? 0 : Integer.parseInt(String.valueOf(r.get("scrapQty")));
                if (qty <= 0) continue;
                if (StringUtils.hasText(sid)) scrapByStyleId.put(sid, qty);
                if (StringUtils.hasText(sno)) scrapByStyleNo.put(sno, qty);
            }
        } catch (Exception e) {
            log.warn("fillScrapFields 查询报废数据异常: {}", e.getMessage());
            return;
        }

        for (StyleInfo s : records) {
            if (s == null) continue;
            String idKey = s.getId() == null ? null : String.valueOf(s.getId());
            Integer byId = StringUtils.hasText(idKey) ? scrapByStyleId.get(idKey) : null;
            if (byId != null && byId > 0) { s.setScrapQuantity(byId); continue; }
            String sno = StringUtils.hasText(s.getStyleNo()) ? s.getStyleNo().trim() : null;
            s.setScrapQuantity(StringUtils.hasText(sno) ? scrapByStyleNo.getOrDefault(sno, 0) : 0);
        }
    }

    public void fillWarehousedFields(List<StyleInfo> records) {
        if (records == null || records.isEmpty()) return;
        Long readableTenantId = resolveReadableTenantId();
        boolean tenantScopedRead = isTenantScopedRead();

        java.util.List<String> styleIds = new java.util.ArrayList<>();
        java.util.Set<String> styleNos = new HashSet<>();
        for (StyleInfo s : records) {
            if (s == null) continue;
            if (s.getId() != null) styleIds.add(String.valueOf(s.getId()));
            if (StringUtils.hasText(s.getStyleNo())) styleNos.add(s.getStyleNo().trim());
        }
        if (styleIds.isEmpty() && styleNos.isEmpty()) return;

        QueryWrapper<com.fashion.supplychain.production.entity.ProductWarehousing> qw = new QueryWrapper<>();
        qw.select("style_id as styleId", "style_no as styleNo", "COALESCE(SUM(qualified_quantity), 0) as warehousedQty")
            .eq(tenantScopedRead, "tenant_id", readableTenantId)
            .and(w -> w.isNull("delete_flag").or().eq("delete_flag", 0))
            .and(w -> {
                boolean hasPrev = false;
                if (!styleIds.isEmpty()) { w.in("style_id", styleIds); hasPrev = true; }
                if (!styleNos.isEmpty()) { if (hasPrev) w.or(); w.in("style_no", styleNos); }
            })
            .groupBy("style_id", "style_no");

        java.util.Map<String, Integer> warehousedByStyleId = new java.util.HashMap<>();
        java.util.Map<String, Integer> warehousedByStyleNo = new java.util.HashMap<>();
        try {
            List<Map<String, Object>> rows = productWarehousingService.listMaps(qw);
            for (Map<String, Object> r : rows) {
                if (r == null) continue;
                String sid = r.get("styleId") == null ? null : String.valueOf(r.get("styleId")).trim();
                String sno = r.get("styleNo") == null ? null : String.valueOf(r.get("styleNo")).trim();
                int qty = r.get("warehousedQty") == null ? 0 : Integer.parseInt(String.valueOf(r.get("warehousedQty")));
                if (qty <= 0) continue;
                if (StringUtils.hasText(sid)) warehousedByStyleId.put(sid, qty);
                if (StringUtils.hasText(sno)) warehousedByStyleNo.put(sno, qty);
            }
        } catch (Exception e) {
            log.warn("fillWarehousedFields 查询入库数据异常: {}", e.getMessage());
            return;
        }

        for (StyleInfo s : records) {
            if (s == null) continue;
            String idKey = s.getId() == null ? null : String.valueOf(s.getId());
            Integer byId = StringUtils.hasText(idKey) ? warehousedByStyleId.get(idKey) : null;
            if (byId != null && byId > 0) { s.setTotalWarehousedQuantity(byId); continue; }
            String sno = StringUtils.hasText(s.getStyleNo()) ? s.getStyleNo().trim() : null;
            s.setTotalWarehousedQuantity(StringUtils.hasText(sno) ? warehousedByStyleNo.getOrDefault(sno, 0) : 0);
        }
    }

    public void fillQuotationPriceFields(List<StyleInfo> records) {
        if (records == null || records.isEmpty()) return;

        java.util.Set<Long> ids = new HashSet<>();
        for (StyleInfo s : records) {
            if (s != null && s.getId() != null) ids.add(s.getId());
        }
        if (styleQuotationService == null) return;

        java.util.Map<Long, String> styleNoByStyleId = new java.util.HashMap<>();
        for (StyleInfo s : records) {
            if (s == null || s.getId() == null) continue;
            if (StringUtils.hasText(s.getStyleNo())) styleNoByStyleId.put(s.getId(), s.getStyleNo().trim());
        }

        java.util.Map<Long, BigDecimal> unitPriceByStyleId = styleQuotationService.resolveFinalUnitPriceByStyleIds(ids, styleNoByStyleId);

        for (StyleInfo s : records) {
            if (s == null || s.getId() == null) continue;
            BigDecimal target = unitPriceByStyleId.get(s.getId());
            if (target == null || target.compareTo(BigDecimal.ZERO) <= 0) continue;
            BigDecimal p = s.getPrice();
            if (p == null || p.compareTo(target) != 0) {
                s.setPrice(target);
                try {
                    StyleInfo patch = new StyleInfo();
                    patch.setId(s.getId());
                    patch.setPrice(target);
                    patch.setUpdateTime(LocalDateTime.now());
                    styleInfoService.updateById(patch);
                } catch (Exception e) {
                    log.warn("fillQuotationPriceFields 更新价格异常: styleId={}", s.getId(), e);
                }
            }
        }
    }

    public void fillProgressFields(List<StyleInfo> records) {
        if (records == null || records.isEmpty()) return;
        Long readableTenantId = resolveReadableTenantId();
        boolean tenantScopedRead = isTenantScopedRead();

        java.util.Set<Long> ids = new HashSet<>();
        for (StyleInfo s : records) {
            if (s != null && s.getId() != null) ids.add(s.getId());
        }

        java.util.Map<Long, com.fashion.supplychain.style.entity.StyleOperationLog> latestMaintenance = new java.util.HashMap<>();
        if (!ids.isEmpty()) {
            List<com.fashion.supplychain.style.entity.StyleOperationLog> logs = styleOperationLogService.lambdaQuery()
                    .in(com.fashion.supplychain.style.entity.StyleOperationLog::getStyleId, ids)
                    .eq(tenantScopedRead, com.fashion.supplychain.style.entity.StyleOperationLog::getTenantId, readableTenantId)
                    .eq(com.fashion.supplychain.style.entity.StyleOperationLog::getBizType, "maintenance")
                    .orderByDesc(com.fashion.supplychain.style.entity.StyleOperationLog::getCreateTime)
                    .list();
            for (com.fashion.supplychain.style.entity.StyleOperationLog logEntry : logs) {
                if (logEntry == null || logEntry.getStyleId() == null) continue;
                if (!latestMaintenance.containsKey(logEntry.getStyleId())) latestMaintenance.put(logEntry.getStyleId(), logEntry);
            }
        }

        java.util.Map<String, PatternProduction> latestPatternByStyleKey = new java.util.HashMap<>();
        if (!ids.isEmpty()) {
            java.util.List<String> styleIdStrings = ids.stream().map(String::valueOf).collect(Collectors.toList());
            List<PatternProduction> patterns = patternProductionService.lambdaQuery()
                    .in(PatternProduction::getStyleId, styleIdStrings)
                    .eq(tenantScopedRead, PatternProduction::getTenantId, readableTenantId)
                    .eq(PatternProduction::getDeleteFlag, 0)
                    .orderByDesc(PatternProduction::getUpdateTime)
                    .orderByDesc(PatternProduction::getCreateTime)
                    .list();
            for (PatternProduction pattern : patterns) {
                if (pattern == null || !StringUtils.hasText(pattern.getStyleId())) continue;
                try {
                    Long styleId = Long.valueOf(pattern.getStyleId().trim());
                    String key = styleId + "|" + (pattern.getColor() == null ? "" : pattern.getColor()).trim().toUpperCase();
                    if (!latestPatternByStyleKey.containsKey(key)) latestPatternByStyleKey.put(key, pattern);
                } catch (Exception e) {
                    log.warn("fillProgressFields styleId解析异常: styleId={}", pattern.getStyleId(), e);
                }
            }
        }

        java.util.Set<String> stockedStyleKeys = new HashSet<>();
        if (!ids.isEmpty()) {
            java.util.List<String> styleIdStringsForStock = ids.stream().map(String::valueOf).collect(Collectors.toList());
            java.util.List<String> styleNosForStock = records.stream()
                    .map(StyleInfo::getStyleNo).filter(StringUtils::hasText).collect(Collectors.toList());
            List<com.fashion.supplychain.stock.entity.SampleStock> stocks = sampleStockMapper.selectList(new QueryWrapper<com.fashion.supplychain.stock.entity.SampleStock>()
                    .and(wrapper -> wrapper.in("style_id", styleIdStringsForStock)
                            .or()
                            .in(!styleNosForStock.isEmpty(), "style_no", styleNosForStock))
                    .eq(tenantScopedRead, "tenant_id", readableTenantId)
                    .eq("sample_type", "development")
                    .eq("delete_flag", 0));
            for (com.fashion.supplychain.stock.entity.SampleStock stock : stocks) {
                if (stock == null) continue;
                if (StringUtils.hasText(stock.getStyleId())) {
                    try {
                        Long styleId = Long.valueOf(stock.getStyleId().trim());
                        stockedStyleKeys.add(styleId + "|" + (stock.getColor() == null ? "" : stock.getColor()).trim().toUpperCase());
                    } catch (Exception e) {
                        log.warn("fillProgressFields stock styleId解析异常: styleId={}", stock.getStyleId(), e);
                    }
                } else if (StringUtils.hasText(stock.getStyleNo())) {
                    for (StyleInfo style : records) {
                        if (style != null && StringUtils.hasText(style.getStyleNo()) && stock.getStyleNo().trim().equalsIgnoreCase(style.getStyleNo().trim()) && style.getId() != null) {
                            stockedStyleKeys.add(style.getId() + "|" + (stock.getColor() == null ? "" : stock.getColor()).trim().toUpperCase());
                        }
                    }
                }
            }
        }

        for (StyleInfo style : records) {
            if (style == null) continue;
            com.fashion.supplychain.style.entity.StyleOperationLog m = style.getId() != null ? latestMaintenance.get(style.getId()) : null;
            style.setMaintenanceTime(m != null ? m.getCreateTime() : null);
            style.setMaintenanceMan(m != null ? m.getOperator() : null);
            style.setMaintenanceRemark(m != null ? m.getRemark() : null);

            PatternProduction latestPattern = style.getId() != null
                    ? latestPatternByStyleKey.get(style.getId() + "|" + (style.getColor() == null ? "" : style.getColor()).trim().toUpperCase())
                    : null;
            if (latestPattern == null && style.getId() != null) {
                for (Map.Entry<String, PatternProduction> entry : latestPatternByStyleKey.entrySet()) {
                    if (entry.getKey().startsWith(style.getId() + "|")) { latestPattern = entry.getValue(); break; }
                }
            }
            String latestPatternStatus = latestPattern != null ? latestPattern.getStatus() : null;
            if (!"COMPLETED".equalsIgnoreCase(String.valueOf(latestPatternStatus)) && style.getId() != null) {
                String styleKey = style.getId() + "|" + (style.getColor() == null ? "" : style.getColor()).trim().toUpperCase();
                if (stockedStyleKeys.contains(styleKey)) latestPatternStatus = "COMPLETED";
            }
            if (!"COMPLETED".equalsIgnoreCase(String.valueOf(latestPatternStatus)) && style.getId() != null) {
                for (String stockKey : stockedStyleKeys) {
                    if (stockKey.startsWith(style.getId() + "|")) { latestPatternStatus = "COMPLETED"; break; }
                }
            }
            if (!"COMPLETED".equalsIgnoreCase(String.valueOf(latestPatternStatus))) {
                String sampleStatus = StringUtils.hasText(style.getSampleStatus()) ? style.getSampleStatus().trim().toUpperCase() : "";
                if ("COMPLETED".equals(sampleStatus)) latestPatternStatus = "COMPLETED";
            }
            style.setLatestPatternStatus(latestPatternStatus);

            String patternStatus = StringUtils.hasText(style.getPatternStatus()) ? style.getPatternStatus().trim() : "";
            String sampleStatus = StringUtils.hasText(style.getSampleStatus()) ? style.getSampleStatus().trim() : "";
            style.setLatestOrderNo(null);
            style.setLatestOrderStatus(null);
            style.setLatestProductionProgress(null);
            if (STYLE_STATUS_SCRAPPED.equalsIgnoreCase(String.valueOf(style.getStatus()))) {
                style.setProgressNode("开发样报废");
                style.setCompletedTime(null);
            } else if ("COMPLETED".equalsIgnoreCase(sampleStatus) || "PRODUCTION_COMPLETED".equalsIgnoreCase(sampleStatus)) {
                style.setProgressNode("样衣完成");
                style.setCompletedTime(style.getSampleCompletedTime());
            } else if ("IN_PROGRESS".equalsIgnoreCase(sampleStatus)) {
                style.setProgressNode("样衣制作中");
                style.setCompletedTime(null);
            } else if ("COMPLETED".equalsIgnoreCase(patternStatus)) {
                style.setProgressNode("纸样完成");
                style.setCompletedTime(style.getPatternCompletedTime());
            } else if ("IN_PROGRESS".equalsIgnoreCase(patternStatus)) {
                style.setProgressNode("纸样开发中");
                style.setCompletedTime(null);
            } else {
                style.setProgressNode("未开始");
                style.setCompletedTime(null);
            }
        }
    }

    private Long resolveReadableTenantId() {
        Long tenantId = UserContext.tenantId();
        return tenantId != null ? tenantId : -1L;
    }

    private boolean isTenantScopedRead() {
        return !UserContext.isSuperAdmin();
    }
}
