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
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.SecondaryProcessService;
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
                .eq("delete_flag", 0);

        // 延期订单筛选：plannedEndDate < 当前时间
        if ("true".equalsIgnoreCase(delayedOnly)) {
            wrapper.isNotNull("planned_end_date")
                   .lt("planned_end_date", java.time.LocalDateTime.now());
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
        // 性能优化：列表查询跳过昂贵的 fillFlowStageFields（查2个视图，759行逻辑）
        // 流程进度条数据仅在详情页（fillDetails）中加载
        // flowStageFillHelper.fillFlowStageFields(resultPage.getRecords());
        // 改用轻量级完成率填充：直接从已填充字段（materialArrivalRate/cuttingQuantity/warehousingQualifiedQuantity）计算
        flowStageFillHelper.fillCompletionRatesLight(resultPage.getRecords());
        // 轻量填充下单人：fillFlowStageFields 已注释，createdByName 是数据库直接字段，直接复用即可
        resultPage.getRecords().forEach(o -> {
            if (o != null && (!org.springframework.util.StringUtils.hasText(o.getOrderOperatorName()))
                    && org.springframework.util.StringUtils.hasText(o.getCreatedByName())) {
                o.setOrderOperatorName(o.getCreatedByName());
            }
        });
        orderQualityFillService.fillQualityStats(resultPage.getRecords());
        progressFillHelper.fixProductionProgressByCompletedQuantity(resultPage.getRecords());
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
        progressFillHelper.fixProductionProgressByCompletedQuantity(productionOrders);
        priceFillHelper.fillFactoryUnitPrice(productionOrders);
        priceFillHelper.fillQuotationUnitPrice(productionOrders);
        priceFillHelper.fillProgressNodeUnitPrices(productionOrders);
    }

    private void fillStyleCover(List<ProductionOrder> records) {
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
                .in(StyleInfo::getStyleNo, styleNos)
                .eq(StyleInfo::getStatus, "ENABLED"));

        Map<String, String> coverMap = new HashMap<>();
        if (styles != null) {
            for (StyleInfo s : styles) {
                if (s != null && StringUtils.hasText(s.getStyleNo())) {
                    coverMap.put(s.getStyleNo(), s.getCover());
                }
            }
        }

        for (ProductionOrder order : records) {
            if (order == null) {
                continue;
            }
            if (StringUtils.hasText(order.getStyleNo())) {
                order.setStyleCover(coverMap.get(order.getStyleNo()));
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
            .eq(StringUtils.hasText(status), "status", status);

        // ✅ 应用操作人权限过滤 - 工人只看自己创建的订单
        DataPermissionHelper.applyOperatorFilter(wrapper, "created_by_id", "created_by_name");

        // 查询所有订单（只查询需要的字段以提高性能）
        wrapper.select("id", "order_no", "order_quantity", "planned_end_date", "create_time");
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

        // 计算延期订单（plannedEndDate < 当前时间）
        LocalDateTime now = LocalDateTime.now();
        List<ProductionOrder> delayedOrders = allOrders.stream()
            .filter(o -> o.getPlannedEndDate() != null && o.getPlannedEndDate().isBefore(now))
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
