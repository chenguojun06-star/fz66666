package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.ParamUtils;
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
                .eq("delete_flag", 0);

        // 延期订单筛选：plannedEndDate < 当前时间，且排除终态订单
        if ("true".equalsIgnoreCase(delayedOnly)) {
            wrapper.isNotNull("planned_end_date")
                   .lt("planned_end_date", java.time.LocalDateTime.now())
                   .notIn("status", java.util.List.of("completed", "cancelled"));
        }

        // 当天下单筛选：createTime 在今天 00:00:00 ~ 23:59:59
        if ("true".equalsIgnoreCase(todayOnly)) {
            java.time.LocalDate today = java.time.LocalDate.now();
            wrapper.ge("create_time", today.atStartOfDay())
                   .le("create_time", today.atTime(23, 59, 59));
        }

        // ✅ 应用操作人权限过滤 - 工人只看自己创建的订单
        DataPermissionHelper.applyOperatorFilter(wrapper, "created_by_id", "created_by_name");

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
        ProductionOrder productionOrder = productionOrderMapper.selectOne(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getId, id)
                .eq(ProductionOrder::getDeleteFlag, 0));

        if (productionOrder != null) {
            fillDetails(List.of(productionOrder));
        }

        return productionOrder;
    }

    public ProductionOrder getDetailByOrderNo(String orderNo) {
        ProductionOrder productionOrder = productionOrderMapper.selectOne(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getOrderNo, orderNo)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .last("limit 1"));

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
                    } catch (NumberFormatException ignored) {}
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
            .eq(StringUtils.hasText(plateType), "plate_type", plateType);

        // ✅ 应用操作人权限过滤 - 工人只看自己创建的订单
        DataPermissionHelper.applyOperatorFilter(wrapper, "created_by_id", "created_by_name");

        // 查询所有订单（只查询需要的字段以提高性能，含 status 字段用于延期判断）
        wrapper.select("id", "order_no", "order_quantity", "planned_end_date", "create_time", "status");
        List<ProductionOrder> allOrders = productionOrderMapper.selectList(wrapper);

        if (allOrders == null || allOrders.isEmpty()) {
            stats.setTotalOrders(0);
            stats.setTotalQuantity(0);
            stats.setDelayedOrders(0);
            stats.setDelayedQuantity(0);
            stats.setTodayOrders(0);
            stats.setTodayQuantity(0);
            return stats;
        }

        // 计算总订单数
        stats.setTotalOrders(allOrders.size());

        // 计算总数量
        long totalQty = allOrders.stream()
            .mapToLong(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0)
            .sum();
        stats.setTotalQuantity(totalQty);

        // 计算延期订单（plannedEndDate < 当前时间，排除终态订单）
        LocalDateTime now = LocalDateTime.now();
        List<ProductionOrder> delayedOrders = allOrders.stream()
            .filter(o -> o.getPlannedEndDate() != null
                && o.getPlannedEndDate().isBefore(now)
                && !"completed".equals(o.getStatus())
                && !"cancelled".equals(o.getStatus()))
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
