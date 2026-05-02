package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.helper.OrderFlowStageFillHelper;
import com.fashion.supplychain.production.helper.OrderPriceFillHelper;
import com.fashion.supplychain.production.helper.OrderProgressFillHelper;
import com.fashion.supplychain.production.helper.OrderStageBundleStatsFillHelper;
import com.fashion.supplychain.production.helper.ProcessParentNodeResolver;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ProductionOrderQueryService {

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private OrderStockFillService orderStockFillService;

    @Autowired
    private OrderCuttingFillService orderCuttingFillService;

    @Autowired
    private OrderQualityFillService orderQualityFillService;

    @Autowired
    private OrderFlowStageFillHelper flowStageFillHelper;

    @Autowired
    private OrderPriceFillHelper priceFillHelper;

    @Autowired
    private OrderProgressFillHelper progressFillHelper;

    @Autowired
    private OrderStageBundleStatsFillHelper stageBundleStatsFillHelper;

    @Autowired
    private SecondaryProcessService secondaryProcessService;

    @Autowired
    private StyleAttachmentService styleAttachmentService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ProcessParentNodeResolver processParentNodeResolver;

    @Autowired
    private ObjectMapper objectMapper;

    public IPage<ProductionOrder> queryPage(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : params;
        int page = ParamUtils.getPage(safeParams);
        int pageSize = ParamUtils.getPageSizeClamped(safeParams, 10, 1, 200);
        Page<ProductionOrder> pageInfo = new Page<>(page, pageSize);

        QueryParams qp = extractQueryParams(safeParams);
        QueryWrapper<ProductionOrder> wrapper = buildQueryWrapper(qp);
        // 终态订单（关单/报废/已完成/已取消/已归档）自动排到最后，同组内按创建时间倒序
        // 修复原因：旧排序仅 create_time DESC，终态订单散落各分页；前端排序只能在当页内重排，无法跨页全局置底
        wrapper.last("ORDER BY CASE WHEN status IN ('closed','scrapped','cancelled','archived','completed') THEN 1 ELSE 0 END ASC, create_time DESC");

        IPage<ProductionOrder> resultPage = productionOrderMapper.selectPage(pageInfo, wrapper);
        enrichOrderList(resultPage);
        applyCurrentProcessNameFilter(resultPage, qp.currentProcessName);
        return resultPage;
    }

    private static class QueryParams {
        String orderNo, styleNo, factoryName, keyword, status, currentProcessName;
        String delayedOnly, todayOnly, urgencyLevel, plateType, merchandiser;
        String includeScrapped, excludeTerminal, orgUnitId, parentOrgUnitId;
        String factoryType, factoryId, customerId, customerName;
        String myOrdersOnly;
    }

    private QueryParams extractQueryParams(Map<String, Object> safeParams) {
        QueryParams qp = new QueryParams();
        qp.orderNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "orderNo"));
        qp.styleNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "styleNo"));
        qp.factoryName = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "factoryName"));
        qp.keyword = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "keyword"));
        qp.status = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "status"));
        qp.currentProcessName = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "currentProcessName"));
        qp.delayedOnly = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "delayedOnly"));
        qp.todayOnly = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "todayOnly"));
        qp.urgencyLevel = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "urgencyLevel"));
        qp.plateType = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "plateType"));
        qp.merchandiser = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "merchandiser"));
        qp.includeScrapped = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "includeScrapped"));
        qp.excludeTerminal = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "excludeTerminal"));
        qp.orgUnitId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "orgUnitId"));
        qp.parentOrgUnitId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "parentOrgUnitId"));
        qp.factoryType = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "factoryType"));
        qp.factoryId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "factoryId"));
        qp.customerId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "customerId"));
        qp.customerName = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "customerName"));
        qp.myOrdersOnly = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "myOrdersOnly"));
        return qp;
    }

    private QueryWrapper<ProductionOrder> buildQueryWrapper(QueryParams qp) {
        QueryWrapper<ProductionOrder> wrapper = new QueryWrapper<ProductionOrder>();
        wrapper.eq(StringUtils.hasText(qp.orderNo), "order_no", qp.orderNo)
                .like(StringUtils.hasText(qp.styleNo), "style_no", qp.styleNo)
                .like(StringUtils.hasText(qp.factoryName), "factory_name", qp.factoryName)
            .and(StringUtils.hasText(qp.keyword), w -> w
                .like("order_no", qp.keyword)
                .or()
                .like("style_no", qp.keyword)
                .or()
                .like("factory_name", qp.keyword))
                .eq(StringUtils.hasText(qp.status), "status", qp.status)
                .eq(StringUtils.hasText(qp.urgencyLevel), "urgency_level", qp.urgencyLevel)
                .eq(StringUtils.hasText(qp.plateType), "plate_type", qp.plateType)
                .eq(StringUtils.hasText(qp.orgUnitId), "org_unit_id", qp.orgUnitId)
                .eq(StringUtils.hasText(qp.parentOrgUnitId), "parent_org_unit_id", qp.parentOrgUnitId)
                .eq(StringUtils.hasText(qp.factoryType), "factory_type", qp.factoryType)
                .like(StringUtils.hasText(qp.merchandiser), "merchandiser", qp.merchandiser)
                .eq(StringUtils.hasText(qp.customerId), "customer_id", qp.customerId)
                .like(StringUtils.hasText(qp.customerName), "customer_name", qp.customerName)
                .eq("delete_flag", 0)
                .ne(!"true".equalsIgnoreCase(qp.includeScrapped), "status", "scrapped");

        if ("true".equalsIgnoreCase(qp.excludeTerminal) && !StringUtils.hasText(qp.status)) {
            wrapper.notIn("status", OrderStatusConstants.TERMINAL_STATUSES);
        }
        if ("true".equalsIgnoreCase(qp.delayedOnly)) {
            wrapper.isNotNull("planned_end_date")
                   .lt("planned_end_date", java.time.LocalDateTime.now())
                   .notIn("status", OrderStatusConstants.TERMINAL_STATUSES);
        }
        if ("true".equalsIgnoreCase(qp.todayOnly)) {
            java.time.LocalDate today = java.time.LocalDate.now();
            wrapper.ge("create_time", today.atStartOfDay())
                   .le("create_time", today.atTime(23, 59, 59));
        }
        String ctxFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        if (org.springframework.util.StringUtils.hasText(ctxFactoryId)) {
            wrapper.and(w -> w.eq("factory_id", ctxFactoryId).or().isNull("factory_id"));
        } else if (org.springframework.util.StringUtils.hasText(qp.factoryId)) {
            wrapper.eq("factory_id", qp.factoryId);
        }

        if ("true".equalsIgnoreCase(qp.myOrdersOnly)
                && !com.fashion.supplychain.common.UserContext.isTenantOwner()
                && !com.fashion.supplychain.common.UserContext.isSuperAdmin()) {
            String currentUserId = com.fashion.supplychain.common.UserContext.userId();
            if (org.springframework.util.StringUtils.hasText(currentUserId)) {
                wrapper.apply(
                    "EXISTS (SELECT 1 FROM t_scan_record sr WHERE sr.order_id = id AND sr.operator_id = {0} AND sr.scan_result = 'success')",
                    currentUserId
                );
            }
        }

        return wrapper;
    }

    private void enrichOrderList(IPage<ProductionOrder> resultPage) {
        fillStyleCover(resultPage.getRecords());
        orderCuttingFillService.fillCuttingSummary(resultPage.getRecords());
        progressFillHelper.fillCurrentProcessName(resultPage.getRecords());
        orderStockFillService.fillStockSummary(resultPage.getRecords());
        flowStageFillHelper.fillFlowStageFields(resultPage.getRecords());
        resultPage.getRecords().forEach(o -> {
            if (o != null && (!org.springframework.util.StringUtils.hasText(o.getOrderOperatorName()))
                    && org.springframework.util.StringUtils.hasText(o.getCreatedByName())) {
                o.setOrderOperatorName(o.getCreatedByName());
            }
        });
        orderQualityFillService.fillQualityStats(resultPage.getRecords());
        stageBundleStatsFillHelper.fillStageBundleStats(resultPage.getRecords());
        priceFillHelper.fillFactoryUnitPrice(resultPage.getRecords());
        priceFillHelper.fillQuotationUnitPrice(resultPage.getRecords());
        priceFillHelper.fillProgressNodeUnitPrices(resultPage.getRecords());
        fillHasSecondaryProcess(resultPage.getRecords());
    }

    private void applyCurrentProcessNameFilter(IPage<ProductionOrder> resultPage, String currentProcessName) {
        if (StringUtils.hasText(currentProcessName)) {
            List<ProductionOrder> filtered = resultPage.getRecords().stream()
                    .filter(order -> {
                        String cpn = order.getCurrentProcessName();
                        return cpn != null && cpn.contains(currentProcessName);
                    })
                    .collect(java.util.stream.Collectors.toList());
            resultPage.setRecords(filtered);
            resultPage.setTotal(filtered.size());
        }
    }


    public ProductionOrder getDetailById(String id) {
        String ctxFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getId, id)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(org.springframework.util.StringUtils.hasText(ctxFactoryId), ProductionOrder::getFactoryId, ctxFactoryId);
        ProductionOrder productionOrder = productionOrderMapper.selectOne(wrapper);

        if (productionOrder != null) {
            fillDetails(List.of(productionOrder));
        }

        return productionOrder;
    }

    public ProductionOrder getDetailByOrderNo(String orderNo) {
        String ctxFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getOrderNo, orderNo)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(org.springframework.util.StringUtils.hasText(ctxFactoryId), ProductionOrder::getFactoryId, ctxFactoryId)
                .last("limit 1");
        ProductionOrder productionOrder = productionOrderMapper.selectOne(wrapper);

        if (productionOrder != null) {
            fillDetails(List.of(productionOrder));
        }

        return productionOrder;
    }

    private void fillDetails(List<ProductionOrder> productionOrders) {
        if (productionOrders == null || productionOrders.isEmpty()) {
            return;
        }
        fillStyleCover(productionOrders);
        orderCuttingFillService.fillCuttingSummary(productionOrders);
        progressFillHelper.fillCurrentProcessName(productionOrders);
        orderStockFillService.fillStockSummary(productionOrders);
        flowStageFillHelper.fillFlowStageFields(productionOrders);
        orderQualityFillService.fillQualityStats(productionOrders);
        priceFillHelper.fillFactoryUnitPrice(productionOrders);
        priceFillHelper.fillQuotationUnitPrice(productionOrders);
        priceFillHelper.fillProgressNodeUnitPrices(productionOrders);
    }

    /**
     * 填充订单款式封面图——与 PC 端 StyleCoverThumb 保持相同数据源。
     *
     * 策略（两级回退）：
     * 1. 优先读 t_style_info.cover（无 ENABLED 过滤，避免非 ENABLED 款式的订单被置 null）
     * 2. 若仍为空，再从 t_style_attachment 取该款式的第一张图片（PC 端的做法）
     *
     * 这样无论款式状态如何、cover 字段是否为空，小程序和 PC 看到的图片永远一致。
     */
    public void fillStyleCover(List<ProductionOrder> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        Set<String> styleNos = records.stream()
                .map(ProductionOrder::getStyleNo)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        if (styleNos.isEmpty()) {
            return;
        }

        List<StyleInfo> styles = styleInfoService.list(new LambdaQueryWrapper<StyleInfo>()
                .in(StyleInfo::getStyleNo, styleNos));

        Map<String, String> coverByStyleNo = new HashMap<>();
        Map<String, Long> styleIdByStyleNo = new HashMap<>();
        if (styles != null) {
            for (StyleInfo s : styles) {
                if (s == null || !StringUtils.hasText(s.getStyleNo())) continue;
                styleIdByStyleNo.put(s.getStyleNo(), s.getId());
                if (StringUtils.hasText(s.getCover())) {
                    coverByStyleNo.put(s.getStyleNo(), s.getCover());
                }
            }
        }

        for (ProductionOrder order : records) {
            if (order == null || !StringUtils.hasText(order.getStyleNo())) continue;
            String cover = coverByStyleNo.get(order.getStyleNo());
            if (StringUtils.hasText(cover)) {
                order.setStyleCover(cover);
                order.setCoverImage(cover);
                order.setStyleImage(cover);
            }
        }

        fillCoverFromAttachments(records, styleIdByStyleNo);
        fillCoverFromTemplates(records);
    }

    private void fillCoverFromAttachments(List<ProductionOrder> records, Map<String, Long> styleIdByStyleNo) {
        List<Long> missingStyleIds = records.stream()
                .filter(o -> o != null && !StringUtils.hasText(o.getStyleCover())
                        && StringUtils.hasText(o.getStyleNo())
                        && styleIdByStyleNo.containsKey(o.getStyleNo()))
                .map(o -> styleIdByStyleNo.get(o.getStyleNo()))
                .distinct()
                .collect(Collectors.toList());

        if (missingStyleIds.isEmpty()) {
            return;
        }

        List<StyleAttachment> attachments = styleAttachmentService.list(
                new LambdaQueryWrapper<StyleAttachment>()
                        .in(StyleAttachment::getStyleId, missingStyleIds.stream()
                                .map(String::valueOf).collect(Collectors.toList()))
                        .like(StyleAttachment::getFileType, "image")
                        .eq(StyleAttachment::getStatus, "active")
                        .orderByAsc(StyleAttachment::getCreateTime));

        Map<Long, String> attachCoverByStyleId = new HashMap<>();
        if (attachments != null) {
            for (StyleAttachment a : attachments) {
                if (a == null || !StringUtils.hasText(a.getFileUrl())) continue;
                try {
                    Long sid = Long.valueOf(a.getStyleId());
                    attachCoverByStyleId.putIfAbsent(sid, a.getFileUrl());
                } catch (NumberFormatException e) { log.debug("数字解析失败: {}", e.getMessage()); }
            }
        }

        for (ProductionOrder order : records) {
            if (order == null || StringUtils.hasText(order.getStyleCover())) continue;
            String styleNo = order.getStyleNo();
            if (!StringUtils.hasText(styleNo)) continue;
            Long sid = styleIdByStyleNo.get(styleNo);
            if (sid == null) continue;
            String attachCover = attachCoverByStyleId.get(sid);
            if (StringUtils.hasText(attachCover)) {
                order.setStyleCover(attachCover);
                order.setCoverImage(attachCover);
                order.setStyleImage(attachCover);
            }
        }
    }

    private void fillCoverFromTemplates(List<ProductionOrder> records) {
        List<String> missingTemplateStyleNos = records.stream()
                .filter(o -> o != null && !StringUtils.hasText(o.getStyleCover()) && StringUtils.hasText(o.getStyleNo()))
                .map(ProductionOrder::getStyleNo)
                .distinct()
                .collect(Collectors.toList());
        if (missingTemplateStyleNos.isEmpty()) {
            return;
        }

        List<TemplateLibrary> templates = templateLibraryService.list(new LambdaQueryWrapper<TemplateLibrary>()
                .eq(TemplateLibrary::getTemplateType, "process_price")
                .in(TemplateLibrary::getSourceStyleNo, missingTemplateStyleNos)
                .orderByDesc(TemplateLibrary::getUpdateTime)
                .orderByDesc(TemplateLibrary::getCreateTime));

        Map<String, String> coverByTemplateStyleNo = new HashMap<>();
        for (TemplateLibrary template : templates) {
            if (template == null || !StringUtils.hasText(template.getSourceStyleNo()) || !StringUtils.hasText(template.getTemplateContent())) {
                continue;
            }
            coverByTemplateStyleNo.putIfAbsent(template.getSourceStyleNo(), extractFirstTemplateImage(template.getTemplateContent()));
        }

        for (ProductionOrder order : records) {
            if (order == null || StringUtils.hasText(order.getStyleCover()) || !StringUtils.hasText(order.getStyleNo())) {
                continue;
            }
            String templateCover = coverByTemplateStyleNo.get(order.getStyleNo());
            if (StringUtils.hasText(templateCover)) {
                order.setStyleCover(templateCover);
                order.setCoverImage(templateCover);
                order.setStyleImage(templateCover);
            }
        }
    }

    private String extractFirstTemplateImage(String templateContent) {
        if (!StringUtils.hasText(templateContent)) {
            return null;
        }
        try {
            Map<String, Object> content = objectMapper.readValue(templateContent, new TypeReference<Map<String, Object>>() {});
            Object rawImages = content.get("images");
            if (!(rawImages instanceof List<?> imageList)) {
                return null;
            }
            for (Object item : imageList) {
                String url = String.valueOf(item == null ? "" : item).trim();
                if (StringUtils.hasText(url)) {
                    return url;
                }
            }
            return null;
        } catch (Exception e) {
            log.debug("[OrderQuery] 提取图片URL失败", e);
            return null;
        }
    }

    /**
     * 获取全局订单统计数据（用于顶部统计卡片）
     * 支持按工厂、关键词、状态等条件筛选，默认返回全部订单统计
     *
     * @param params 筛选参数（keyword, factoryName, status等）
     * @return 统计数据DTO
     */
    public com.fashion.supplychain.production.dto.ProductionOrderStatsDTO getGlobalStats(java.util.Map<String, Object> params) {
        com.fashion.supplychain.production.dto.ProductionOrderStatsDTO stats =
            new com.fashion.supplychain.production.dto.ProductionOrderStatsDTO();

        java.util.Map<String, Object> safeParams = params == null ? new java.util.HashMap<>() : params;
        QueryWrapper<ProductionOrder> wrapper = buildStatsQueryWrapper(safeParams);

        try {
            java.util.List<java.util.Map<String, Object>> rows = productionOrderMapper.selectMaps(
                wrapper.select(
                    "SUM(CASE WHEN status NOT IN ('completed','cancelled','scrapped','archived','closed') THEN 1 ELSE 0 END) AS active_orders",
                    "COALESCE(SUM(CASE WHEN status NOT IN ('completed','cancelled','scrapped','archived','closed') THEN order_quantity ELSE 0 END), 0) AS active_quantity",
                    "SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_orders",
                    "COALESCE(SUM(CASE WHEN status = 'completed' THEN order_quantity ELSE 0 END), 0) AS completed_quantity",
                    "SUM(CASE WHEN status = 'scrapped' THEN 1 ELSE 0 END) AS scrapped_orders",
                    "COALESCE(SUM(CASE WHEN status = 'scrapped' THEN order_quantity ELSE 0 END), 0) AS scrapped_quantity",
                    "SUM(CASE WHEN status NOT IN ('completed','cancelled','scrapped','archived','closed') AND planned_end_date IS NOT NULL AND planned_end_date < NOW() THEN 1 ELSE 0 END) AS delayed_orders",
                    "COALESCE(SUM(CASE WHEN status NOT IN ('completed','cancelled','scrapped','archived','closed') AND planned_end_date IS NOT NULL AND planned_end_date < NOW() THEN order_quantity ELSE 0 END), 0) AS delayed_quantity",
                    "SUM(CASE WHEN create_time >= CURDATE() AND create_time < CURDATE() + INTERVAL 1 DAY THEN 1 ELSE 0 END) AS today_orders",
                    "COALESCE(SUM(CASE WHEN create_time >= CURDATE() AND create_time < CURDATE() + INTERVAL 1 DAY THEN order_quantity ELSE 0 END), 0) AS today_quantity"
                )
            );

            if (rows != null && !rows.isEmpty()) {
                java.util.Map<String, Object> r = rows.get(0);
                long activeOrders = toLong(r.get("active_orders"));
                long activeQty = toLong(r.get("active_quantity"));
                stats.setActiveOrders(activeOrders);
                stats.setActiveQuantity(activeQty);
                stats.setCompletedOrders(toLong(r.get("completed_orders")));
                stats.setCompletedQuantity(toLong(r.get("completed_quantity")));
                stats.setScrappedOrders(toLong(r.get("scrapped_orders")));
                stats.setScrappedQuantity(toLong(r.get("scrapped_quantity")));
                stats.setTotalOrders(activeOrders);
                stats.setTotalQuantity(activeQty);
                stats.setDelayedOrders(toLong(r.get("delayed_orders")));
                stats.setDelayedQuantity(toLong(r.get("delayed_quantity")));
                stats.setTodayOrders(toLong(r.get("today_orders")));
                stats.setTodayQuantity(toLong(r.get("today_quantity")));
            } else {
                resetStatsToZero(stats);
            }
        } catch (Exception e) {
            log.warn("[OrderQuery] getGlobalStats SQL聚合失败，回退零值", e);
            resetStatsToZero(stats);
        }
        return stats;
    }

    private long toLong(Object val) {
        if (val == null) return 0;
        if (val instanceof Number) return ((Number) val).longValue();
        try { return Long.parseLong(val.toString()); } catch (Exception e) { return 0; }
    }

    private QueryWrapper<ProductionOrder> buildStatsQueryWrapper(java.util.Map<String, Object> safeParams) {
        String keyword = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "keyword"));
        String status = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "status"));
        String factoryName = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "factoryName"));
        String orderNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "orderNo"));
        String styleNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "styleNo"));
        String urgencyLevel = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "urgencyLevel"));
        String plateType = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "plateType"));
        String merchandiser = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "merchandiser"));
        String includeScrapped = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "includeScrapped"));
        String excludeTerminal = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "excludeTerminal"));
        String delayedOnly = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "delayedOnly"));
        String todayOnly = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "todayOnly"));

        QueryWrapper<ProductionOrder> wrapper = new QueryWrapper<>();
        wrapper.eq("delete_flag", 0);
        wrapper.eq(StringUtils.hasText(orderNo), "order_no", orderNo)
            .eq(StringUtils.hasText(styleNo), "style_no", styleNo)
            .like(StringUtils.hasText(factoryName), "factory_name", factoryName)
            .and(StringUtils.hasText(keyword), w -> w
                .like("order_no", keyword).or()
                .like("style_no", keyword).or()
                .like("factory_name", keyword))
            .eq(StringUtils.hasText(status), "status", status)
            .eq(StringUtils.hasText(urgencyLevel), "urgency_level", urgencyLevel)
            .eq(StringUtils.hasText(plateType), "plate_type", plateType)
            .like(StringUtils.hasText(merchandiser), "merchandiser", merchandiser)
            .ne(!"true".equalsIgnoreCase(includeScrapped), "status", "scrapped");

        if ("true".equalsIgnoreCase(excludeTerminal) && !StringUtils.hasText(status)) {
            wrapper.notIn("status", OrderStatusConstants.TERMINAL_STATUSES);
        }
        if ("true".equalsIgnoreCase(delayedOnly)) {
            wrapper.isNotNull("planned_end_date")
                    .lt("planned_end_date", LocalDateTime.now())
                    .notIn("status", OrderStatusConstants.TERMINAL_STATUSES);
        }
        if ("true".equalsIgnoreCase(todayOnly)) {
            java.time.LocalDate today = java.time.LocalDate.now();
            wrapper.ge("create_time", today.atStartOfDay())
                    .le("create_time", today.atTime(23, 59, 59));
        }

        String ctxFactoryId2 = com.fashion.supplychain.common.UserContext.factoryId();
        if (org.springframework.util.StringUtils.hasText(ctxFactoryId2)) {
            wrapper.eq("factory_id", ctxFactoryId2);
        }
        return wrapper;
    }

    private void resetStatsToZero(com.fashion.supplychain.production.dto.ProductionOrderStatsDTO stats) {
        stats.setActiveOrders(0);
        stats.setActiveQuantity(0);
        stats.setCompletedOrders(0);
        stats.setCompletedQuantity(0);
        stats.setScrappedOrders(0);
        stats.setScrappedQuantity(0);
        stats.setTotalOrders(0);
        stats.setTotalQuantity(0);
        stats.setDelayedOrders(0);
        stats.setDelayedQuantity(0);
        stats.setTodayOrders(0);
        stats.setTodayQuantity(0);
    }

    private void fillStatusStats(com.fashion.supplychain.production.dto.ProductionOrderStatsDTO stats, List<ProductionOrder> allOrders) {
        List<ProductionOrder> activeOrders = allOrders.stream()
            .filter(o -> !isTerminalStatus(o.getStatus()))
            .collect(Collectors.toList());
        List<ProductionOrder> completedOrders = allOrders.stream()
            .filter(o -> "completed".equalsIgnoreCase(normalizeStatus(o.getStatus())))
            .collect(Collectors.toList());
        List<ProductionOrder> scrappedOrders = allOrders.stream()
            .filter(o -> "scrapped".equalsIgnoreCase(normalizeStatus(o.getStatus())))
            .collect(Collectors.toList());

        long activeQty = activeOrders.stream()
            .mapToLong(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum();
        long completedQty = completedOrders.stream()
            .mapToLong(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum();
        long scrappedQty = scrappedOrders.stream()
            .mapToLong(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum();

        stats.setActiveOrders(activeOrders.size());
        stats.setActiveQuantity(activeQty);
        stats.setCompletedOrders(completedOrders.size());
        stats.setCompletedQuantity(completedQty);
        stats.setScrappedOrders(scrappedOrders.size());
        stats.setScrappedQuantity(scrappedQty);
        stats.setTotalOrders(activeOrders.size());
        stats.setTotalQuantity(activeQty);
    }

    private void fillDelayedAndTodayStats(com.fashion.supplychain.production.dto.ProductionOrderStatsDTO stats, List<ProductionOrder> allOrders) {
        LocalDateTime now = LocalDateTime.now();
        List<ProductionOrder> activeOrders = allOrders.stream()
            .filter(o -> !isTerminalStatus(o.getStatus()))
            .collect(Collectors.toList());

        List<ProductionOrder> delayedOrders = activeOrders.stream()
            .filter(o -> o.getPlannedEndDate() != null && o.getPlannedEndDate().isBefore(now))
            .collect(Collectors.toList());
        stats.setDelayedOrders(delayedOrders.size());
        stats.setDelayedQuantity(delayedOrders.stream()
            .mapToLong(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum());

        LocalDateTime todayStart = now.toLocalDate().atStartOfDay();
        LocalDateTime todayEnd = now.toLocalDate().atTime(23, 59, 59);
        List<ProductionOrder> todayOrders = allOrders.stream()
            .filter(o -> o.getCreateTime() != null
                && !o.getCreateTime().isBefore(todayStart)
                && !o.getCreateTime().isAfter(todayEnd))
            .collect(Collectors.toList());
        stats.setTodayOrders(todayOrders.size());
        stats.setTodayQuantity(todayOrders.stream()
            .mapToLong(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum());
    }

    private boolean isTerminalStatus(String status) {
        return OrderStatusConstants.TERMINAL_STATUSES.contains(normalizeStatus(status));
    }

    private String normalizeStatus(String status) {
        return status == null ? "" : status.trim().toLowerCase();
    }

    /**
     * 批量填充"款式是否配置二次工艺"标记，用于前端列表显示二次工艺进度列
     * <p>
     * 检测策略（"或"逻辑，按优先级）：
     * <ol>
     *   <li>flow stage 数据：实际已扫码的二次工艺（secondaryProcessStartTime/EndTime 非空）</li>
     *   <li>工序节点数据：progressNodeUnitPrices 中任一节点的 progressStage 为"二次工艺"，
     *       或节点名称经父节点映射解析为"二次工艺"</li>
     *   <li>t_secondary_process 表：仅当 progressNodeUnitPrices 为空（订单尚未生成生产流程）时兜底</li>
     * </ol>
     */
    private void fillHasSecondaryProcess(List<ProductionOrder> orders) {
        if (orders == null || orders.isEmpty()) return;
        // 收集所有 styleId（String → Long 转换）
        Set<Long> styleIds = orders.stream()
                .map(ProductionOrder::getStyleId)
                .filter(id -> id != null && !id.isBlank())
                .map(id -> {
                    try { return Long.parseLong(id); } catch (NumberFormatException e) { return null; }
                })
                .filter(id -> id != null)
                .collect(Collectors.toSet());
        // 三级：t_secondary_process 表查询
        Set<Long> hasSecIds = new HashSet<>();
        if (!styleIds.isEmpty()) {
            hasSecIds = new HashSet<>(
                    secondaryProcessService.lambdaQuery()
                            .in(SecondaryProcess::getStyleId, styleIds)
                            .list()
                            .stream()
                            .map(SecondaryProcess::getStyleId)
                            .collect(Collectors.toSet())
            );
        }
        // 回填到每个订单
        for (ProductionOrder o : orders) {
            boolean hasSec = false;
            // 一级：flow stage 实际扫码数据
            if (o.getSecondaryProcessStartTime() != null || o.getSecondaryProcessEndTime() != null) {
                hasSec = true;
            }
            // 二级：progressNodeUnitPrices 节点→父节点映射
            if (!hasSec) {
                List<Object> nodes = o.getProgressNodeUnitPrices();
                if (nodes != null && !nodes.isEmpty()) {
                    for (Object nodeObj : nodes) {
                        if (nodeObj instanceof Map) {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> node = (Map<String, Object>) nodeObj;
                            String stage = (String) node.getOrDefault("progressStage", "");
                            if ("二次工艺".equals(stage)) {
                                hasSec = true;
                                break;
                            }
                            String name = (String) node.getOrDefault("name",
                                    node.getOrDefault("processName", ""));
                            if (StringUtils.hasText(name) && processParentNodeResolver.isParentNodeMatch(name.trim(), "二次工艺")) {
                                hasSec = true;
                                break;
                            }
                        }
                    }
                } else {
                    // 三级：progressNodeUnitPrices 为空，降级到 t_secondary_process 表
                    try {
                        Long sid = (o.getStyleId() != null && !o.getStyleId().isBlank())
                                ? Long.parseLong(o.getStyleId()) : null;
                        hasSec = (sid != null && hasSecIds.contains(sid));
                    } catch (NumberFormatException e) {
                        hasSec = false;
                    }
                }
            }
            o.setHasSecondaryProcess(hasSec);
        }
    }

}
