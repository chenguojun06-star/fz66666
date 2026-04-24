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
    private SecondaryProcessService secondaryProcessService;

    @Autowired
    private StyleAttachmentService styleAttachmentService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ObjectMapper objectMapper;

    public IPage<ProductionOrder> queryPage(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : params;
        int page = ParamUtils.getPage(safeParams);
        int pageSize = ParamUtils.getPageSizeClamped(safeParams, 10, 1, 200);

        Page<ProductionOrder> pageInfo = new Page<>(page, pageSize);

        String orderNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "orderNo"));
        String styleNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "styleNo"));
        String factoryName = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "factoryName"));
        String keyword = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "keyword"));
        String status = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "status"));
        String currentProcessName = ParamUtils
                .toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "currentProcessName"));
        String delayedOnly = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "delayedOnly"));
        String todayOnly = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "todayOnly"));
        String urgencyLevel = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "urgencyLevel"));
        String plateType = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "plateType"));
        String merchandiser = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "merchandiser"));
        String includeScrapped = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "includeScrapped"));
        String excludeTerminal = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "excludeTerminal"));
        String orgUnitId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "orgUnitId"));
        String parentOrgUnitId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "parentOrgUnitId"));
        String factoryType = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "factoryType"));
        String factoryId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "factoryId"));

        QueryWrapper<ProductionOrder> wrapper = new QueryWrapper<ProductionOrder>();
        wrapper.eq(StringUtils.hasText(orderNo), "order_no", orderNo)
                .like(StringUtils.hasText(styleNo), "style_no", styleNo)
                .like(StringUtils.hasText(factoryName), "factory_name", factoryName)
            .and(StringUtils.hasText(keyword), w -> w
                .like("order_no", keyword)
                .or()
                .like("style_no", keyword)
                .or()
                .like("factory_name", keyword))
                .eq(StringUtils.hasText(status), "status", status)
                .eq(StringUtils.hasText(urgencyLevel), "urgency_level", urgencyLevel)
                .eq(StringUtils.hasText(plateType), "plate_type", plateType)
                .eq(StringUtils.hasText(orgUnitId), "org_unit_id", orgUnitId)
                .eq(StringUtils.hasText(parentOrgUnitId), "parent_org_unit_id", parentOrgUnitId)
                .eq(StringUtils.hasText(factoryType), "factory_type", factoryType)
                .like(StringUtils.hasText(merchandiser), "merchandiser", merchandiser)
                .eq("delete_flag", 0)
                // 我的订单页传 includeScrapped=true 时显示报废订单，其他页面默认过滤
                .ne(!"true".equalsIgnoreCase(includeScrapped), "status", "scrapped");

        // 统一终态过滤：默认生产页只看在制单，不混入已完成/已取消/已报废/已归档/已关单
        if ("true".equalsIgnoreCase(excludeTerminal) && !StringUtils.hasText(status)) {
            wrapper.notIn("status", OrderStatusConstants.TERMINAL_STATUSES);
        }

        // 延期订单筛选：plannedEndDate < 当前时间，且排除终态订单
        if ("true".equalsIgnoreCase(delayedOnly)) {
            wrapper.isNotNull("planned_end_date")
                   .lt("planned_end_date", java.time.LocalDateTime.now())
                   .notIn("status", OrderStatusConstants.TERMINAL_STATUSES);
        }

        // 当天下单筛选：createTime 在今天 00:00:00 ~ 23:59:59
        if ("true".equalsIgnoreCase(todayOnly)) {
            java.time.LocalDate today = java.time.LocalDate.now();
            wrapper.ge("create_time", today.atStartOfDay())
                   .le("create_time", today.atTime(23, 59, 59));
        }

        // 数据隔离策略：
        // 1. 外发工厂账号：按 factory_id 隔离（只看本工厂订单），优先级最高
        // 2. 管理员/跟单员通过请求参数 factoryId 按工厂筛选（如外发工厂侧边栏选择特定工厂）
        // 3. 其他账号（租户主）：依赖 TenantInterceptor 租户级隔离，显示全部订单
        String ctxFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        if (org.springframework.util.StringUtils.hasText(ctxFactoryId)) {
            // 工厂账号：只能看自己工厂的订单（登录上下文隔离，不可绕过）
            wrapper.eq("factory_id", ctxFactoryId);
        } else if (org.springframework.util.StringUtils.hasText(factoryId)) {
            // 管理员通过前端参数筛选特定工厂（如外发工厂页面侧边栏选择工厂）
            wrapper.eq("factory_id", factoryId);
        }
        if (log.isDebugEnabled()) {
            log.debug("[queryPage] userId={}, tenantOwner={}, permRange={}, factoryId={}, dataScope={}",
                    com.fashion.supplychain.common.UserContext.userId(),
                    com.fashion.supplychain.common.UserContext.isTenantOwner(),
                    com.fashion.supplychain.common.UserContext.get() != null ? com.fashion.supplychain.common.UserContext.get().getPermissionRange() : "N/A",
                    ctxFactoryId,
                    com.fashion.supplychain.common.UserContext.getDataScope());
        }

        wrapper.orderByDesc("create_time");

        IPage<ProductionOrder> resultPage = productionOrderMapper.selectPage(pageInfo, wrapper);

        fillStyleCover(resultPage.getRecords());
        orderCuttingFillService.fillCuttingSummary(resultPage.getRecords());
        progressFillHelper.fillCurrentProcessName(resultPage.getRecords());
        orderStockFillService.fillStockSummary(resultPage.getRecords());
        // 恢复完整的流程阶段数据填充：从 v_production_order_flow_stage_snapshot 视图读取实际扫码数量
        // 确保列表页进度条（车缝/二次工艺/质检等）显示真实值，而非以入库量近似代替
        flowStageFillHelper.fillFlowStageFields(resultPage.getRecords());
        // 兜底：若 fillFlowStageFields 未能填充下单人，则从 createdByName 复用
        resultPage.getRecords().forEach(o -> {
            if (o != null && (!org.springframework.util.StringUtils.hasText(o.getOrderOperatorName()))
                    && org.springframework.util.StringUtils.hasText(o.getCreatedByName())) {
                o.setOrderOperatorName(o.getCreatedByName());
            }
        });
        orderQualityFillService.fillQualityStats(resultPage.getRecords());
        priceFillHelper.fillFactoryUnitPrice(resultPage.getRecords());
        priceFillHelper.fillQuotationUnitPrice(resultPage.getRecords());
        priceFillHelper.fillProgressNodeUnitPrices(resultPage.getRecords());
        fillHasSecondaryProcess(resultPage.getRecords());

        // 在应用层过滤 currentProcessName（因为它是计算字段，不在数据库表中）
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

        return resultPage;
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

        // ── 第一级：t_style_info.cover（去掉 ENABLED 过滤，所有状态的款式都取） ──
        List<StyleInfo> styles = styleInfoService.list(new LambdaQueryWrapper<StyleInfo>()
                .in(StyleInfo::getStyleNo, styleNos));

        // styleNo → cover URL
        Map<String, String> coverByStyleNo = new HashMap<>();
        // styleNo → styleId（Long），用于第二级查附件
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

        // 第一次赋值
        for (ProductionOrder order : records) {
            if (order == null || !StringUtils.hasText(order.getStyleNo())) continue;
            String cover = coverByStyleNo.get(order.getStyleNo());
            if (StringUtils.hasText(cover)) {
                order.setStyleCover(cover);
            }
        }

        // ── 第二级：对仍无封面的订单，从 t_style_attachment 取第一张图片（PC 端同款逻辑） ──
        List<Long> missingStyleIds = records.stream()
                .filter(o -> o != null && !StringUtils.hasText(o.getStyleCover())
                        && StringUtils.hasText(o.getStyleNo())
                        && styleIdByStyleNo.containsKey(o.getStyleNo()))
                .map(o -> styleIdByStyleNo.get(o.getStyleNo()))
                .distinct()
                .collect(Collectors.toList());

        if (!missingStyleIds.isEmpty()) {
            List<StyleAttachment> attachments = styleAttachmentService.list(
                    new LambdaQueryWrapper<StyleAttachment>()
                            .in(StyleAttachment::getStyleId, missingStyleIds.stream()
                                    .map(String::valueOf).collect(Collectors.toList()))
                            .like(StyleAttachment::getFileType, "image")
                            .eq(StyleAttachment::getStatus, "active")
                            .orderByAsc(StyleAttachment::getCreateTime));

            // styleId → 第一张图片 URL
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

            // 最终回写
            for (ProductionOrder order : records) {
                if (order == null || StringUtils.hasText(order.getStyleCover())) continue;
                String styleNo = order.getStyleNo();
                if (!StringUtils.hasText(styleNo)) continue;
                Long sid = styleIdByStyleNo.get(styleNo);
                if (sid == null) continue;
                String attachCover = attachCoverByStyleId.get(sid);
                if (StringUtils.hasText(attachCover)) {
                    order.setStyleCover(attachCover);
                }
            }
        }

        List<String> missingTemplateStyleNos = records.stream()
                .filter(o -> o != null && !StringUtils.hasText(o.getStyleCover()) && StringUtils.hasText(o.getStyleNo()))
                .map(ProductionOrder::getStyleNo)
                .distinct()
                .collect(Collectors.toList());
        if (!missingTemplateStyleNos.isEmpty()) {
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
                }
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

        // 安全处理空参数
        java.util.Map<String, Object> safeParams = params == null ? new java.util.HashMap<>() : params;

        // 提取筛选参数（与queryPage保持一致）
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

        // 构建基础查询条件
        QueryWrapper<ProductionOrder> wrapper = new QueryWrapper<>();
        wrapper.eq("delete_flag", 0);

        // 应用筛选条件（与queryPage保持一致）
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

        // 与 queryPage 保持一致：生产订单默认是租户共享资源，仅外发工厂账号按 factory_id 隔离
        String ctxFactoryId2 = com.fashion.supplychain.common.UserContext.factoryId();
        if (org.springframework.util.StringUtils.hasText(ctxFactoryId2)) {
            wrapper.eq("factory_id", ctxFactoryId2);
        }

        // 查询所有订单（只查询需要的字段以提高性能，含 status 字段用于延期判断）
        wrapper.select("id", "order_no", "order_quantity", "planned_end_date", "create_time", "status");
        List<ProductionOrder> allOrders = productionOrderMapper.selectList(wrapper);

        if (allOrders == null || allOrders.isEmpty()) {
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
            return stats;
        }

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
            .mapToLong(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0)
            .sum();
        long completedQty = completedOrders.stream()
            .mapToLong(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0)
            .sum();
        long scrappedQty = scrappedOrders.stream()
            .mapToLong(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0)
            .sum();

        stats.setActiveOrders(activeOrders.size());
        stats.setActiveQuantity(activeQty);
        stats.setCompletedOrders(completedOrders.size());
        stats.setCompletedQuantity(completedQty);
        stats.setScrappedOrders(scrappedOrders.size());
        stats.setScrappedQuantity(scrappedQty);

        // 兼容旧字段：继续返回在制口径
        stats.setTotalOrders(activeOrders.size());
        stats.setTotalQuantity(activeQty);

        // 计算延期订单（plannedEndDate < 当前时间，排除终态订单）
        LocalDateTime now = LocalDateTime.now();
        List<ProductionOrder> delayedOrders = activeOrders.stream()
            .filter(o -> o.getPlannedEndDate() != null
                && o.getPlannedEndDate().isBefore(now))
            .collect(Collectors.toList());

        stats.setDelayedOrders(delayedOrders.size());

        long delayedQty = delayedOrders.stream()
            .mapToLong(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0)
            .sum();
        stats.setDelayedQuantity(delayedQty);

        // 计算当天下单（createTime 在今天 00:00:00 ~ 23:59:59）
        LocalDateTime todayStart = now.toLocalDate().atStartOfDay();
        LocalDateTime todayEnd = now.toLocalDate().atTime(23, 59, 59);
        List<ProductionOrder> todayOrders = allOrders.stream()
            .filter(o -> o.getCreateTime() != null
                && !o.getCreateTime().isBefore(todayStart)
                && !o.getCreateTime().isAfter(todayEnd))
            .collect(Collectors.toList());

        stats.setTodayOrders(todayOrders.size());

        long todayQty = todayOrders.stream()
            .mapToLong(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0)
            .sum();
        stats.setTodayQuantity(todayQty);

        return stats;
    }

    private boolean isTerminalStatus(String status) {
        return OrderStatusConstants.TERMINAL_STATUSES.contains(normalizeStatus(status));
    }

    private String normalizeStatus(String status) {
        return status == null ? "" : status.trim().toLowerCase();
    }

    /**
     * 批量填充"款式是否配置二次工艺"标记，用于前端列表显示二次工艺进度列
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
        if (styleIds.isEmpty()) return;
        // 一次查询：找出哪些 styleId 在 t_secondary_process 表中有记录
        Set<Long> hasSecIds = new HashSet<>(
                secondaryProcessService.lambdaQuery()
                        .in(SecondaryProcess::getStyleId, styleIds)
                        .list()
                        .stream()
                        .map(SecondaryProcess::getStyleId)
                        .collect(Collectors.toSet())
        );
        // 回填到每个订单
        for (ProductionOrder o : orders) {
            try {
                Long sid = (o.getStyleId() != null && !o.getStyleId().isBlank())
                        ? Long.parseLong(o.getStyleId()) : null;
                o.setHasSecondaryProcess(sid != null && hasSecIds.contains(sid));
            } catch (NumberFormatException e) {
                o.setHasSecondaryProcess(false);
            }
        }
    }

}
