package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.stock.entity.SampleStock;
import com.fashion.supplychain.stock.mapper.SampleStockMapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleOperationLog;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleOperationLogService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import java.math.BigDecimal;
import java.util.NoSuchElementException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Lazy;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Set;
import java.util.HashSet;
import java.util.ArrayList;
import java.time.LocalDateTime;

/**
 * 款号资料Service实现类
 */
@lombok.extern.slf4j.Slf4j
@Service
public class StyleInfoServiceImpl extends ServiceImpl<StyleInfoMapper, StyleInfo> implements StyleInfoService {

    private static final String STYLE_STATUS_ENABLED = "ENABLED";
    private static final String STYLE_STATUS_DISABLED = "DISABLED";
    private static final String STYLE_STATUS_SCRAPPED = "SCRAPPED";

    @Autowired
    private StyleOperationLogService styleOperationLogService;

    // NOTE [架构债务] ProductionOrderService 是跨模块依赖（production→style）
    // queryPage中的订单统计、附加统计量逻辑应迁移到StyleInfoOrchestrator
    @Autowired
    private ObjectProvider<ProductionOrderService> productionOrderServiceProvider;

    @Autowired
    private ObjectProvider<ProductWarehousingService> productWarehousingServiceProvider;

    @Autowired
    @Lazy
    private StyleQuotationService styleQuotationService;

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private SampleStockMapper sampleStockMapper;

    @Override
    public IPage<StyleInfo> queryPage(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);
        Long readableTenantId = resolveReadableTenantId();
        boolean tenantScopedRead = isTenantScopedRead();

        // 创建分页对象
        Page<StyleInfo> pageInfo = new Page<>(page, pageSize);

        // 构建查询条件
        String styleNo = (String) params.getOrDefault("styleNo", "");
        String styleNoExact = (String) params.getOrDefault("styleNoExact", "");
        String styleName = (String) params.getOrDefault("styleName", "");
        String category = (String) params.getOrDefault("category", "");
        String keyword = (String) params.getOrDefault("keyword", "");
        String progressNode = (String) params.getOrDefault("progressNode", "");

        boolean onlyCompleted = false;
        Object onlyCompletedRaw = params.get("onlyCompleted");
        if (onlyCompletedRaw != null) {
            String s = String.valueOf(onlyCompletedRaw).trim();
            onlyCompleted = "1".equals(s) || "true".equalsIgnoreCase(s) || "yes".equalsIgnoreCase(s);
        }

        boolean pushedToOrderOnly = false;
        Object pushedToOrderOnlyRaw = params.get("pushedToOrderOnly");
        if (pushedToOrderOnlyRaw != null) {
            String s = String.valueOf(pushedToOrderOnlyRaw).trim();
            pushedToOrderOnly = "1".equals(s) || "true".equalsIgnoreCase(s) || "yes".equalsIgnoreCase(s);
        }

        // 是否排除已报废款式（待办任务等场景只关心进行中的款式）
        boolean excludeScrapped = Boolean.TRUE.equals(params.get("excludeScrapped"));

        // 使用条件构造器进行查询
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<StyleInfo> wrapper =
            new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<StyleInfo>()
                .eq(tenantScopedRead, StyleInfo::getTenantId, readableTenantId)
                .eq(StringUtils.hasText(styleNoExact), StyleInfo::getStyleNo, styleNoExact)
                .like(!StringUtils.hasText(styleNoExact) && StringUtils.hasText(styleNo), StyleInfo::getStyleNo, styleNo)
                .like(StringUtils.hasText(styleName), StyleInfo::getStyleName, styleName)
                .eq(StringUtils.hasText(category), StyleInfo::getCategory, category)
                .and(StringUtils.hasText(keyword), w -> w
                    .like(StyleInfo::getStyleNo, keyword)
                    .or()
                    .like(StyleInfo::getStyleName, keyword)
                    .or()
                    .like(StyleInfo::getCategory, keyword))
                .eq(onlyCompleted, StyleInfo::getSampleStatus, "COMPLETED")
                .eq(pushedToOrderOnly, StyleInfo::getPushedToOrder, 1);
        // 状态过滤：excludeScrapped=true 时只查进行中款式，否则同时包含已报废款式（样衣列表页需要展示报废记录）
        if (excludeScrapped) {
            wrapper.eq(StyleInfo::getStatus, STYLE_STATUS_ENABLED);
        } else {
            wrapper.and(w -> w.eq(StyleInfo::getStatus, STYLE_STATUS_ENABLED)
                    .or()
                    .eq(StyleInfo::getStatus, STYLE_STATUS_SCRAPPED));
        }
        // 排除已推大货：excludePushedToOrder=true 时过滤掉 pushedToOrder=1 的款式（样衣开发待办只关心还未推大货的款）
        boolean excludePushedToOrder = Boolean.TRUE.equals(params.get("excludePushedToOrder"));
        if (excludePushedToOrder) {
            // pushedToOrder IS NULL 或 pushedToOrder != 1，涵盖未设置和明确未推大货两种情况
            wrapper.and(w -> w.isNull(StyleInfo::getPushedToOrder).or().ne(StyleInfo::getPushedToOrder, 1));
        }

        if (StringUtils.hasText(progressNode)) {
            String node = progressNode.trim();
            switch (node) {
                case "开发样报废" -> wrapper.eq(StyleInfo::getStatus, STYLE_STATUS_SCRAPPED);
                case "样衣完成" -> wrapper.and(w -> w.eq(StyleInfo::getSampleStatus, "COMPLETED").or().eq(StyleInfo::getSampleStatus, "Completed"));
                case "样衣制作中" -> wrapper.and(w -> w.eq(StyleInfo::getSampleStatus, "IN_PROGRESS").or().eq(StyleInfo::getSampleStatus, "In_Progress"));
                case "纸样完成" -> wrapper
                    .and(w -> w.eq(StyleInfo::getPatternStatus, "COMPLETED").or().eq(StyleInfo::getPatternStatus, "Completed"))
                    .and(w -> w.isNull(StyleInfo::getSampleStatus)
                        .or()
                        .notIn(StyleInfo::getSampleStatus, "COMPLETED", "Completed", "IN_PROGRESS", "In_Progress"));
                case "纸样开发中" -> wrapper
                    .and(w -> w.eq(StyleInfo::getPatternStatus, "IN_PROGRESS").or().eq(StyleInfo::getPatternStatus, "In_Progress"))
                    .and(w -> w.isNull(StyleInfo::getSampleStatus)
                        .or()
                        .notIn(StyleInfo::getSampleStatus, "COMPLETED", "Completed", "IN_PROGRESS", "In_Progress"));
                case "未开始" -> wrapper
                    .and(w -> w.isNull(StyleInfo::getSampleStatus)
                        .or()
                        .notIn(StyleInfo::getSampleStatus, "COMPLETED", "Completed", "IN_PROGRESS", "In_Progress"))
                    .and(w -> w.isNull(StyleInfo::getPatternStatus)
                        .or()
                        .notIn(StyleInfo::getPatternStatus, "COMPLETED", "Completed", "IN_PROGRESS", "In_Progress"));
                default -> {
                }
            }
        }

        IPage<StyleInfo> resultPage = baseMapper.selectPage(pageInfo,
            wrapper.orderByDesc(StyleInfo::getCreateTime));

        fillQuotationPriceFields(resultPage.getRecords());
        fillProgressFields(resultPage.getRecords());
        fillOrderCountFields(resultPage.getRecords());
        fillScrapFields(resultPage.getRecords());
        fillWarehousedFields(resultPage.getRecords());

        return resultPage;
    }

    private void fillOrderCountFields(List<StyleInfo> records) {
        if (records == null || records.isEmpty()) {
            return;
        }
        Long readableTenantId = resolveReadableTenantId();
        boolean tenantScopedRead = isTenantScopedRead();

        StyleIdentifiers ids = collectStyleIdentifiers(records);
        if (ids.styleIds.isEmpty() && ids.styleNos.isEmpty()) {
            return;
        }

        ProductionOrderService productionOrderService = productionOrderServiceProvider.getIfAvailable();
        if (productionOrderService == null) {
            return;
        }

        OrderCountData countData = queryOrderCounts(productionOrderService, ids, readableTenantId, tenantScopedRead);
        OrderTimeData timeData = queryLatestOrderTimes(productionOrderService, ids, readableTenantId, tenantScopedRead);
        applyOrderCounts(records, countData, timeData);
    }

    private static class StyleIdentifiers {
        List<String> styleIds = new ArrayList<>();
        Set<String> styleNos = new HashSet<>();
    }

    private static class OrderCountData {
        Map<String, Integer> countByStyleId = new HashMap<>();
        Map<String, Integer> countByStyleNo = new HashMap<>();
        Map<String, Integer> quantityByStyleId = new HashMap<>();
        Map<String, Integer> quantityByStyleNo = new HashMap<>();
    }

    private static class OrderTimeData {
        Map<String, LocalDateTime> latestOrderTimeByStyleId = new HashMap<>();
        Map<String, LocalDateTime> latestOrderTimeByStyleNo = new HashMap<>();
        Map<String, String> latestOrderCreatorByStyleId = new HashMap<>();
        Map<String, String> latestOrderCreatorByStyleNo = new HashMap<>();
    }

    private StyleIdentifiers collectStyleIdentifiers(List<StyleInfo> records) {
        StyleIdentifiers ids = new StyleIdentifiers();
        for (StyleInfo s : records) {
            if (s == null) {
                continue;
            }
            if (s.getId() != null) {
                ids.styleIds.add(String.valueOf(s.getId()));
            }
            if (StringUtils.hasText(s.getStyleNo())) {
                ids.styleNos.add(s.getStyleNo().trim());
            }
        }
        return ids;
    }

    private OrderCountData queryOrderCounts(ProductionOrderService productionOrderService,
            StyleIdentifiers ids, Long readableTenantId, boolean tenantScopedRead) {
        OrderCountData data = new OrderCountData();
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.select("style_id as styleId", "style_no as styleNo", "count(1) as cnt", "COALESCE(SUM(order_quantity), 0) as totalQty")
                .eq(tenantScopedRead, "tenant_id", readableTenantId)
                .and(w -> {
                    boolean hasPrev = false;
                    if (!ids.styleIds.isEmpty()) {
                        w.in("style_id", ids.styleIds);
                        hasPrev = true;
                    }
                    if (!ids.styleNos.isEmpty()) {
                        if (hasPrev) {
                            w.or();
                        }
                        w.in("style_no", ids.styleNos);
                    }
                })
                .and(w -> w.isNull("delete_flag").or().eq("delete_flag", 0))
                .groupBy("style_id", "style_no");

        List<Map<String, Object>> rows = productionOrderService.listMaps(qw);
        for (Map<String, Object> r : rows) {
            if (r == null) {
                continue;
            }
            String sid = r.get("styleId") == null ? null : String.valueOf(r.get("styleId")).trim();
            String sno = r.get("styleNo") == null ? null : String.valueOf(r.get("styleNo")).trim();
            int cnt;
            int totalQty;
            try {
                cnt = r.get("cnt") == null ? 0 : Integer.parseInt(String.valueOf(r.get("cnt")));
                totalQty = r.get("totalQty") == null ? 0 : Integer.parseInt(String.valueOf(r.get("totalQty")));
            } catch (Exception e) {
                cnt = 0;
                totalQty = 0;
            }
            if (cnt <= 0) {
                continue;
            }
            if (StringUtils.hasText(sid)) {
                data.countByStyleId.put(sid, cnt);
                data.quantityByStyleId.put(sid, totalQty);
            }
            if (StringUtils.hasText(sno)) {
                data.countByStyleNo.put(sno, cnt);
                data.quantityByStyleNo.put(sno, totalQty);
            }
        }
        return data;
    }

    private OrderTimeData queryLatestOrderTimes(ProductionOrderService productionOrderService,
            StyleIdentifiers ids, Long readableTenantId, boolean tenantScopedRead) {
        OrderTimeData data = new OrderTimeData();
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
                        if (!ids.styleIds.isEmpty()) {
                            w.in("style_id", ids.styleIds);
                            hasPrev = true;
                        }
                        if (!ids.styleNos.isEmpty()) {
                            if (hasPrev) {
                                w.or();
                            }
                            w.in("style_no", ids.styleNos);
                        }
                    })
                    .and(w -> w.isNull("delete_flag").or().eq("delete_flag", 0))
                    .groupBy("style_id", "style_no");

        List<Map<String, Object>> timeRows = productionOrderService.listMaps(timeQw);
        for (Map<String, Object> r : timeRows) {
            if (r == null) {
                continue;
            }
            String sid = r.get("styleId") == null ? null : String.valueOf(r.get("styleId")).trim();
            String sno = r.get("styleNo") == null ? null : String.valueOf(r.get("styleNo")).trim();
            Object latestTimeObj = r.get("latestTime");
            LocalDateTime latestTime = null;
            if (latestTimeObj instanceof LocalDateTime) {
                latestTime = (LocalDateTime) latestTimeObj;
            } else if (latestTimeObj instanceof java.sql.Timestamp) {
                latestTime = ((java.sql.Timestamp) latestTimeObj).toLocalDateTime();
            } else if (latestTimeObj instanceof java.util.Date) {
                latestTime = ((java.util.Date) latestTimeObj).toInstant()
                        .atZone(java.time.ZoneId.systemDefault()).toLocalDateTime();
            }
            String latestCreator = r.get("latestCreator") == null ? null : String.valueOf(r.get("latestCreator")).trim();

            if (latestTime != null) {
                if (StringUtils.hasText(sid)) {
                    data.latestOrderTimeByStyleId.put(sid, latestTime);
                    if (StringUtils.hasText(latestCreator)) {
                        data.latestOrderCreatorByStyleId.put(sid, latestCreator);
                    }
                }
                if (StringUtils.hasText(sno)) {
                    data.latestOrderTimeByStyleNo.put(sno, latestTime);
                    if (StringUtils.hasText(latestCreator)) {
                        data.latestOrderCreatorByStyleNo.put(sno, latestCreator);
                    }
                }
            }
        }
        return data;
    }

    private void applyOrderCounts(List<StyleInfo> records, OrderCountData countData, OrderTimeData timeData) {
        for (StyleInfo s : records) {
            if (s == null) {
                continue;
            }
            String idKey = s.getId() == null ? null : String.valueOf(s.getId());
            Integer byId = StringUtils.hasText(idKey) ? countData.countByStyleId.get(idKey) : null;
            if (byId != null && byId > 0) {
                s.setOrderCount(byId);
                s.setTotalOrderQuantity(countData.quantityByStyleId.get(idKey));
                if (StringUtils.hasText(idKey)) {
                    s.setLatestOrderTime(timeData.latestOrderTimeByStyleId.get(idKey));
                    s.setLatestOrderCreator(timeData.latestOrderCreatorByStyleId.get(idKey));
                }
                continue;
            }
            String sno = StringUtils.hasText(s.getStyleNo()) ? s.getStyleNo().trim() : null;
            s.setOrderCount(StringUtils.hasText(sno) ? countData.countByStyleNo.getOrDefault(sno, 0) : 0);
            s.setTotalOrderQuantity(StringUtils.hasText(sno) ? countData.quantityByStyleNo.getOrDefault(sno, 0) : 0);
            if (StringUtils.hasText(sno)) {
                s.setLatestOrderTime(timeData.latestOrderTimeByStyleNo.get(sno));
                s.setLatestOrderCreator(timeData.latestOrderCreatorByStyleNo.get(sno));
            }
        }
    }

    private void fillScrapFields(List<StyleInfo> records) {
        if (records == null || records.isEmpty()) {
            return;
        }
        Long readableTenantId = resolveReadableTenantId();
        boolean tenantScopedRead = isTenantScopedRead();
        ProductWarehousingService warehousingService = productWarehousingServiceProvider.getIfAvailable();
        if (warehousingService == null) {
            return;
        }

        List<String> styleIds = new ArrayList<>();
        Set<String> styleNos = new HashSet<>();
        for (StyleInfo s : records) {
            if (s == null) continue;
            if (s.getId() != null) styleIds.add(String.valueOf(s.getId()));
            if (StringUtils.hasText(s.getStyleNo())) styleNos.add(s.getStyleNo().trim());
        }
        if (styleIds.isEmpty() && styleNos.isEmpty()) return;

        QueryWrapper<ProductWarehousing> qw = new QueryWrapper<>();
        qw.select("style_id as styleId", "style_no as styleNo", "COALESCE(SUM(unqualified_quantity), 0) as scrapQty")
            .eq(tenantScopedRead, "tenant_id", readableTenantId)
                .eq("repair_status", "scrapped")
                .and(w -> w.isNull("delete_flag").or().eq("delete_flag", 0))
                .and(w -> {
                    boolean hasPrev = false;
                    if (!styleIds.isEmpty()) {
                        w.in("style_id", styleIds);
                        hasPrev = true;
                    }
                    if (!styleNos.isEmpty()) {
                        if (hasPrev) w.or();
                        w.in("style_no", styleNos);
                    }
                })
                .groupBy("style_id", "style_no");

        Map<String, Integer> scrapByStyleId = new HashMap<>();
        Map<String, Integer> scrapByStyleNo = new HashMap<>();
        try {
            List<Map<String, Object>> rows = warehousingService.listMaps(qw);
            for (Map<String, Object> r : rows) {
                if (r == null) continue;
                String sid = r.get("styleId") == null ? null : String.valueOf(r.get("styleId")).trim();
                String sno = r.get("styleNo") == null ? null : String.valueOf(r.get("styleNo")).trim();
                int qty;
                try {
                    qty = r.get("scrapQty") == null ? 0 : Integer.parseInt(String.valueOf(r.get("scrapQty")));
                } catch (Exception e) {
                    qty = 0;
                }
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
            if (byId != null && byId > 0) {
                s.setScrapQuantity(byId);
                continue;
            }
            String sno = StringUtils.hasText(s.getStyleNo()) ? s.getStyleNo().trim() : null;
            s.setScrapQuantity(StringUtils.hasText(sno) ? scrapByStyleNo.getOrDefault(sno, 0) : 0);
        }
    }

    private void fillWarehousedFields(List<StyleInfo> records) {
        if (records == null || records.isEmpty()) {
            return;
        }
        Long readableTenantId = resolveReadableTenantId();
        boolean tenantScopedRead = isTenantScopedRead();
        ProductWarehousingService warehousingService = productWarehousingServiceProvider.getIfAvailable();
        if (warehousingService == null) {
            return;
        }

        List<String> styleIds = new ArrayList<>();
        Set<String> styleNos = new HashSet<>();
        for (StyleInfo s : records) {
            if (s == null) continue;
            if (s.getId() != null) styleIds.add(String.valueOf(s.getId()));
            if (StringUtils.hasText(s.getStyleNo())) styleNos.add(s.getStyleNo().trim());
        }
        if (styleIds.isEmpty() && styleNos.isEmpty()) return;

        QueryWrapper<ProductWarehousing> qw = new QueryWrapper<>();
        qw.select("style_id as styleId", "style_no as styleNo", "COALESCE(SUM(qualified_quantity), 0) as warehousedQty")
            .eq(tenantScopedRead, "tenant_id", readableTenantId)
            .and(w -> w.isNull("delete_flag").or().eq("delete_flag", 0))
            .and(w -> {
                boolean hasPrev = false;
                if (!styleIds.isEmpty()) {
                    w.in("style_id", styleIds);
                    hasPrev = true;
                }
                if (!styleNos.isEmpty()) {
                    if (hasPrev) w.or();
                    w.in("style_no", styleNos);
                }
            })
            .groupBy("style_id", "style_no");

        Map<String, Integer> warehousedByStyleId = new HashMap<>();
        Map<String, Integer> warehousedByStyleNo = new HashMap<>();
        try {
            List<Map<String, Object>> rows = warehousingService.listMaps(qw);
            for (Map<String, Object> r : rows) {
                if (r == null) continue;
                String sid = r.get("styleId") == null ? null : String.valueOf(r.get("styleId")).trim();
                String sno = r.get("styleNo") == null ? null : String.valueOf(r.get("styleNo")).trim();
                int qty;
                try {
                    qty = r.get("warehousedQty") == null ? 0 : Integer.parseInt(String.valueOf(r.get("warehousedQty")));
                } catch (Exception e) {
                    qty = 0;
                }
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
            if (byId != null && byId > 0) {
                s.setTotalWarehousedQuantity(byId);
                continue;
            }
            String sno = StringUtils.hasText(s.getStyleNo()) ? s.getStyleNo().trim() : null;
            s.setTotalWarehousedQuantity(StringUtils.hasText(sno) ? warehousedByStyleNo.getOrDefault(sno, 0) : 0);
        }
    }

    private void fillQuotationPriceFields(List<StyleInfo> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        Set<Long> ids = new HashSet<>();
        for (StyleInfo s : records) {
            if (s != null && s.getId() != null) {
                ids.add(s.getId());
            }
        }

        if (styleQuotationService == null) {
            return;
        }

        Map<Long, String> styleNoByStyleId = new HashMap<>();
        for (StyleInfo s : records) {
            if (s == null || s.getId() == null) {
                continue;
            }
            if (StringUtils.hasText(s.getStyleNo())) {
                styleNoByStyleId.put(s.getId(), s.getStyleNo().trim());
            }
        }

        Map<Long, BigDecimal> unitPriceByStyleId = styleQuotationService.resolveFinalUnitPriceByStyleIds(ids,
                styleNoByStyleId);

        for (StyleInfo s : records) {
            if (s == null || s.getId() == null) {
                continue;
            }

            BigDecimal target = unitPriceByStyleId.get(s.getId());
            if (target == null || target.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }

            BigDecimal p = s.getPrice();

            if (p == null || p.compareTo(target) != 0) {
                s.setPrice(target);
                try {
                    StyleInfo patch = new StyleInfo();
                    patch.setId(s.getId());
                    patch.setPrice(target);
                    patch.setUpdateTime(LocalDateTime.now());
                    this.updateById(patch);
                } catch (Exception e) {
                    log.warn("StyleInfoServiceImpl.fillQuotationPriceFields 更新价格异常: styleId={}", s.getId(), e);
                }
            }
        }
    }

    private void fillProgressFields(List<StyleInfo> records) {
        if (records == null || records.isEmpty()) {
            return;
        }
        Long readableTenantId = resolveReadableTenantId();
        boolean tenantScopedRead = isTenantScopedRead();

        Set<Long> ids = new HashSet<>();
        for (StyleInfo s : records) {
            if (s != null && s.getId() != null) {
                ids.add(s.getId());
            }
        }

        Map<Long, StyleOperationLog> latestMaintenance = loadMaintenanceLogs(ids, readableTenantId, tenantScopedRead);
        Map<String, PatternProduction> latestPatternByStyleKey = loadPatternProductions(ids, readableTenantId, tenantScopedRead);
        Set<String> stockedStyleKeys = loadSampleStocks(ids, records, readableTenantId, tenantScopedRead);

        for (StyleInfo style : records) {
            if (style == null) {
                continue;
            }
            StyleOperationLog m = style.getId() != null ? latestMaintenance.get(style.getId()) : null;
            style.setMaintenanceTime(m != null ? m.getCreateTime() : null);
            style.setMaintenanceMan(m != null ? m.getOperator() : null);
            style.setMaintenanceRemark(m != null ? m.getRemark() : null);

            String latestPatternStatus = resolveLatestPatternStatus(style, latestPatternByStyleKey, stockedStyleKeys);
            style.setLatestPatternStatus(latestPatternStatus);

            assignProgressNode(style);
        }
    }

    private Map<Long, StyleOperationLog> loadMaintenanceLogs(Set<Long> ids, Long readableTenantId, boolean tenantScopedRead) {
        Map<Long, StyleOperationLog> latestMaintenance = new HashMap<>();
        if (ids.isEmpty()) {
            return latestMaintenance;
        }
        List<StyleOperationLog> logs = styleOperationLogService.lambdaQuery()
                .in(StyleOperationLog::getStyleId, ids)
                .eq(tenantScopedRead, StyleOperationLog::getTenantId, readableTenantId)
                .eq(StyleOperationLog::getBizType, "maintenance")
                .orderByDesc(StyleOperationLog::getCreateTime)
                .list();
        for (StyleOperationLog log : logs) {
            if (log == null || log.getStyleId() == null) {
                continue;
            }
            if (!latestMaintenance.containsKey(log.getStyleId())) {
                latestMaintenance.put(log.getStyleId(), log);
            }
        }
        return latestMaintenance;
    }

    private Map<String, PatternProduction> loadPatternProductions(Set<Long> ids, Long readableTenantId, boolean tenantScopedRead) {
        Map<String, PatternProduction> latestPatternByStyleKey = new HashMap<>();
        if (ids.isEmpty()) {
            return latestPatternByStyleKey;
        }
        List<String> styleIdStrings = ids.stream().map(String::valueOf).toList();
        List<PatternProduction> patterns = patternProductionService.lambdaQuery()
                .in(PatternProduction::getStyleId, styleIdStrings)
                .eq(tenantScopedRead, PatternProduction::getTenantId, readableTenantId)
                .eq(PatternProduction::getDeleteFlag, 0)
                .orderByDesc(PatternProduction::getUpdateTime)
                .orderByDesc(PatternProduction::getCreateTime)
                .list();
        for (PatternProduction pattern : patterns) {
            if (pattern == null || !StringUtils.hasText(pattern.getStyleId())) {
                continue;
            }
            try {
                Long styleId = Long.valueOf(pattern.getStyleId().trim());
                String key = buildStyleColorKey(styleId, pattern.getColor());
                if (!latestPatternByStyleKey.containsKey(key)) {
                    latestPatternByStyleKey.put(key, pattern);
                }
            } catch (Exception e) {
                log.warn("StyleInfoServiceImpl.loadPatternProductions styleId解析异常: styleId={}", pattern.getStyleId(), e);
            }
        }
        return latestPatternByStyleKey;
    }

    private Set<String> loadSampleStocks(Set<Long> ids, List<StyleInfo> records, Long readableTenantId, boolean tenantScopedRead) {
        Set<String> stockedStyleKeys = new HashSet<>();
        if (ids.isEmpty()) {
            return stockedStyleKeys;
        }
        List<String> styleIdStringsForStock = ids.stream().map(String::valueOf).toList();
        List<String> styleNosForStock = records.stream()
                .map(StyleInfo::getStyleNo)
                .filter(StringUtils::hasText)
                .toList();
        List<SampleStock> stocks = sampleStockMapper.selectList(new QueryWrapper<SampleStock>()
                .and(wrapper -> wrapper.in("style_id", styleIdStringsForStock)
                        .or()
                        .in(!styleNosForStock.isEmpty(), "style_no", styleNosForStock))
                .eq(tenantScopedRead, "tenant_id", readableTenantId)
                .eq("sample_type", "development")
                .eq("delete_flag", 0));
        for (SampleStock stock : stocks) {
            if (stock == null) {
                continue;
            }
            if (StringUtils.hasText(stock.getStyleId())) {
                try {
                    Long styleId = Long.valueOf(stock.getStyleId().trim());
                    stockedStyleKeys.add(buildStyleColorKey(styleId, stock.getColor()));
                } catch (Exception e) {
                    log.warn("StyleInfoServiceImpl.loadSampleStocks stock styleId解析异常: styleId={}", stock.getStyleId(), e);
                }
            } else if (StringUtils.hasText(stock.getStyleNo())) {
                for (StyleInfo style : records) {
                    if (style != null && StringUtils.hasText(style.getStyleNo()) && stock.getStyleNo().trim().equalsIgnoreCase(style.getStyleNo().trim()) && style.getId() != null) {
                        stockedStyleKeys.add(buildStyleColorKey(style.getId(), stock.getColor()));
                    }
                }
            }
        }
        return stockedStyleKeys;
    }

    private String resolveLatestPatternStatus(StyleInfo style, Map<String, PatternProduction> latestPatternByStyleKey, Set<String> stockedStyleKeys) {
        PatternProduction latestPattern = style.getId() != null
                ? latestPatternByStyleKey.get(buildStyleColorKey(style.getId(), style.getColor()))
                : null;
        if (latestPattern == null && style.getId() != null) {
            for (Map.Entry<String, PatternProduction> entry : latestPatternByStyleKey.entrySet()) {
                if (entry.getKey().startsWith(style.getId() + "|")) {
                    latestPattern = entry.getValue();
                    break;
                }
            }
        }
        String latestPatternStatus = latestPattern != null ? latestPattern.getStatus() : null;
        if (!"COMPLETED".equalsIgnoreCase(String.valueOf(latestPatternStatus))
                && style.getId() != null
                && stockedStyleKeys.contains(buildStyleColorKey(style.getId(), style.getColor()))) {
            latestPatternStatus = "COMPLETED";
        }
        if (!"COMPLETED".equalsIgnoreCase(String.valueOf(latestPatternStatus))
                && style.getId() != null) {
            for (String stockKey : stockedStyleKeys) {
                if (stockKey.startsWith(style.getId() + "|")) {
                    latestPatternStatus = "COMPLETED";
                    break;
                }
            }
        }
        if (!"COMPLETED".equalsIgnoreCase(String.valueOf(latestPatternStatus))) {
            String sampleStatus = StringUtils.hasText(style.getSampleStatus()) ? style.getSampleStatus().trim().toUpperCase() : "";
            if ("COMPLETED".equals(sampleStatus)) {
                latestPatternStatus = "COMPLETED";
            }
        }
        return latestPatternStatus;
    }

    private void assignProgressNode(StyleInfo style) {
        String patternStatus = StringUtils.hasText(style.getPatternStatus()) ? style.getPatternStatus().trim() : "";
        String sampleStatus = StringUtils.hasText(style.getSampleStatus()) ? style.getSampleStatus().trim() : "";

        style.setLatestOrderNo(null);
        style.setLatestOrderStatus(null);
        style.setLatestProductionProgress(null);

        if (STYLE_STATUS_SCRAPPED.equalsIgnoreCase(String.valueOf(style.getStatus()))) {
            style.setProgressNode("开发样报废");
            style.setCompletedTime(null);
            return;
        }
        if ("COMPLETED".equalsIgnoreCase(sampleStatus)) {
            style.setProgressNode("样衣完成");
            style.setCompletedTime(style.getSampleCompletedTime());
            return;
        }
        if ("IN_PROGRESS".equalsIgnoreCase(sampleStatus)) {
            style.setProgressNode("样衣制作中");
            style.setCompletedTime(null);
            return;
        }
        if ("COMPLETED".equalsIgnoreCase(patternStatus)) {
            style.setProgressNode("纸样完成");
            style.setCompletedTime(style.getPatternCompletedTime());
            return;
        }
        if ("IN_PROGRESS".equalsIgnoreCase(patternStatus)) {
            style.setProgressNode("纸样开发中");
            style.setCompletedTime(null);
            return;
        }
        style.setProgressNode("未开始");
        style.setCompletedTime(null);
    }

    private String buildStyleColorKey(Long styleId, String color) {
        return String.valueOf(styleId) + "|" + String.valueOf(color == null ? "" : color).trim().toUpperCase();
    }

    @Override
    public StyleInfo getDetailById(Long id) {
        Long readableTenantId = resolveReadableTenantId();
        boolean tenantScopedRead = isTenantScopedRead();
        StyleInfo style = baseMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<StyleInfo>()
                        .eq(StyleInfo::getId, id)
                .eq(tenantScopedRead, StyleInfo::getTenantId, readableTenantId)
                .and(w -> w.eq(StyleInfo::getStatus, STYLE_STATUS_ENABLED)
                    .or()
                    .eq(StyleInfo::getStatus, STYLE_STATUS_SCRAPPED)));
        if (style == null) {
            return null;
        }

        try {
            Set<Long> one = new HashSet<>();
            one.add(id);
            Map<Long, String> styleNoByStyleId = new HashMap<>();
            if (StringUtils.hasText(style.getStyleNo())) {
                styleNoByStyleId.put(id, style.getStyleNo().trim());
            }
            BigDecimal target = null;

            StyleQuotation quotation = styleQuotationService == null ? null : styleQuotationService.getByStyleId(id);
            BigDecimal qp = quotation == null ? null : quotation.getTotalPrice();
            boolean fromQuotation = qp != null && qp.compareTo(BigDecimal.ZERO) > 0;
            if (fromQuotation) {
                target = qp;
            }

            BigDecimal current = style.getPrice();
            boolean needFallback = (current == null || current.compareTo(BigDecimal.ZERO) <= 0);
            if (target == null && needFallback && styleQuotationService != null) {
                target = styleQuotationService.resolveFinalUnitPriceByStyleIds(one, styleNoByStyleId).get(id);
            }

            if (target != null) {
                BigDecimal p = style.getPrice();
                if (p == null || p.compareTo(target) != 0) {
                    style.setPrice(target);
                    if (fromQuotation || p == null || p.compareTo(BigDecimal.ZERO) <= 0) {
                        StyleInfo patch = new StyleInfo();
                        patch.setId(id);
                        patch.setPrice(target);
                        patch.setUpdateTime(LocalDateTime.now());
                        this.updateById(patch);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("StyleInfoServiceImpl.getDetailById 更新报价价格异常: styleId={}", id, e);
        }

        // 设置进度节点（与列表页逻辑一致）
        String patternStatus = StringUtils.hasText(style.getPatternStatus()) ? style.getPatternStatus().trim() : "";
        String sampleStatus = StringUtils.hasText(style.getSampleStatus()) ? style.getSampleStatus().trim() : "";

        if (STYLE_STATUS_SCRAPPED.equalsIgnoreCase(String.valueOf(style.getStatus()))) {
            style.setProgressNode("开发样报废");
            style.setCompletedTime(null);
        } else if ("COMPLETED".equalsIgnoreCase(sampleStatus)) {
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

        return style;
    }

    private boolean isTenantScopedRead() {
        return !UserContext.isSuperAdmin();
    }

    private Long resolveReadableTenantId() {
        Long tenantId = UserContext.tenantId();
        return tenantId != null ? tenantId : -1L;
    }

    @Override
    public boolean saveOrUpdateStyle(StyleInfo styleInfo) {
        LocalDateTime now = LocalDateTime.now();

        if (styleInfo.getId() != null) {
            // 更新操作
            StyleInfo existing = this.getById(styleInfo.getId());
            if (existing != null) {
                styleInfo.setCreateTime(existing.getCreateTime());
                styleInfo.setPrice(existing.getPrice());
            }
            styleInfo.setUpdateTime(now);
        } else {
            // 新增操作
            if (styleInfo.getCreateTime() == null) {
                styleInfo.setCreateTime(now);
            }
            styleInfo.setUpdateTime(now);
            if (!StringUtils.hasText(styleInfo.getStatus())) {
                styleInfo.setStatus(STYLE_STATUS_ENABLED);
            }
            // 品类默认值（数据库NOT NULL约束要求）
            if (!StringUtils.hasText(styleInfo.getCategory())) {
                styleInfo.setCategory("未分类");
            }
            styleInfo.setPrice(null);

            // 设计师 = 创建款式的人（自动填充）
            String currentUser = UserContext.username();
            if (!StringUtils.hasText(styleInfo.getSampleNo())) {
                if (StringUtils.hasText(currentUser)) {
                    styleInfo.setSampleNo(currentUser);
                }
            }

            // 自动生成款号和SKC
            String timeStr = now.format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMddHHmm"));

            if (!StringUtils.hasText(styleInfo.getStyleNo())) {
                String initials = "ST";
                try {
                    if (StringUtils.hasText(currentUser)) {
                        String py = cn.hutool.extra.pinyin.PinyinUtil.getFirstLetter(currentUser, "");
                        if (StringUtils.hasText(py)) {
                            initials = py.toUpperCase();
                        }
                    }
                } catch (Exception e) {
                    log.error("Failed to generate pinyin initials for user: " + currentUser, e);
                }
                styleInfo.setStyleNo(initials + timeStr);
            }

            if (!StringUtils.hasText(styleInfo.getSkc())) {
                styleInfo.setSkc("SKC" + timeStr);
            }
        }

        return this.saveOrUpdate(styleInfo);
    }

    @Override
    public boolean deleteById(Long id) {
        StyleInfo styleInfo = new StyleInfo();
        styleInfo.setId(id);
        styleInfo.setStatus(STYLE_STATUS_DISABLED);
        styleInfo.setUpdateTime(LocalDateTime.now());

        return this.updateById(styleInfo);
    }

    @Override
    public boolean isPatternLocked(Long styleId) {
        if (styleId == null) {
            return false;
        }
        StyleInfo style = this.getById(styleId);
        if (style == null) {
            return false;
        }
        if (Integer.valueOf(0).equals(style.getPatternRevLocked())) {
            return false;
        }
        String status = String.valueOf(style.getPatternStatus() == null ? "" : style.getPatternStatus()).trim();
        return "COMPLETED".equalsIgnoreCase(status);
    }

    @Override
    public StyleInfo getValidatedForOrderCreate(String styleId, String styleNo) {
        String sid = StringUtils.hasText(styleId) ? styleId.trim() : null;
        String sno = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        if (!StringUtils.hasText(sid) && !StringUtils.hasText(sno)) {
            throw new IllegalStateException("缺少款号信息，无法下单");
        }

        StyleInfo style = null;
        if (sid != null && !sid.isEmpty()) {
            boolean numeric = true;
            for (int i = 0; i < sid.length(); i++) {
                if (!Character.isDigit(sid.charAt(i))) {
                    numeric = false;
                    break;
                }
            }
            if (numeric) {
                style = this.lambdaQuery()
                        .select(StyleInfo::getId,
                                StyleInfo::getStyleNo,
                                StyleInfo::getStyleName,
                                StyleInfo::getStatus,
                                StyleInfo::getSampleStatus,
                                StyleInfo::getPatternStatus)
                        .eq(StyleInfo::getId, Long.parseLong(sid))
                        .last("limit 1")
                        .one();
            }
        }

        if (style == null && StringUtils.hasText(sno)) {
            style = this.lambdaQuery()
                    .select(StyleInfo::getId,
                            StyleInfo::getStyleNo,
                            StyleInfo::getStyleName,
                            StyleInfo::getStatus,
                            StyleInfo::getSampleStatus,
                            StyleInfo::getPatternStatus)
                    .eq(StyleInfo::getStyleNo, sno)
                    .last("limit 1")
                    .one();
        }

        if (style == null) {
            throw new NoSuchElementException("款号不存在");
        }

        String st = style.getStatus() == null ? "" : style.getStatus().trim();
        if (STYLE_STATUS_SCRAPPED.equalsIgnoreCase(st)) {
            throw new IllegalStateException("开发样已报废，无法下单");
        }
        if (StringUtils.hasText(st) && !STYLE_STATUS_ENABLED.equalsIgnoreCase(st)) {
            throw new IllegalStateException("款号已禁用，无法下单");
        }

        String sampleStatus = style.getSampleStatus() == null ? "" : style.getSampleStatus().trim();
        if (!"COMPLETED".equalsIgnoreCase(sampleStatus)) {
            throw new IllegalStateException("款号资料未完成（样衣未完成），无法下单");
        }

        return style;
    }
}
