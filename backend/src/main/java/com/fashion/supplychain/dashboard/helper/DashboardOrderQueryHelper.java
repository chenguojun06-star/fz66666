package com.fashion.supplychain.dashboard.helper;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.dashboard.dto.DelayedItemDto;
import com.fashion.supplychain.dashboard.dto.DelayedStageGroup;
import com.fashion.supplychain.dashboard.dto.SampleStageStatsDto;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class DashboardOrderQueryHelper {

    private final StyleInfoService styleInfoService;
    private final ProductionOrderService productionOrderService;
    private final ProductionOrderMapper productionOrderMapper;
    private final MaterialPurchaseService materialPurchaseService;
    private final DashboardCacheHelper cacheHelper;

    public DashboardOrderQueryHelper(
            StyleInfoService styleInfoService,
            ProductionOrderService productionOrderService,
            ProductionOrderMapper productionOrderMapper,
            MaterialPurchaseService materialPurchaseService,
            DashboardCacheHelper cacheHelper) {
        this.styleInfoService = styleInfoService;
        this.productionOrderService = productionOrderService;
        this.productionOrderMapper = productionOrderMapper;
        this.materialPurchaseService = materialPurchaseService;
        this.cacheHelper = cacheHelper;
    }

    public long countEnabledStyles() {
        Number cached = cacheHelper.getFromCache("enabledStyles");
        if (cached != null) return cached.longValue();
        long result = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStatus, "ENABLED").count();
        cacheHelper.putToCache("enabledStyles", result);
        return result;
    }

    public long countProductionOrders() {
        Number cached = cacheHelper.getFromCache("productionOrders");
        if (cached != null) return cached.longValue();
        long result = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived", "scrapped")
                .count();
        cacheHelper.putToCache("productionOrders", result);
        return result;
    }

    public long countUrgentEvents() {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        String factoryId = com.fashion.supplychain.common.UserContext.factoryId();
        String factorySuffix = org.springframework.util.StringUtils.hasText(factoryId) ? "." + factoryId : "";
        String cacheKey = "urgentEvents" + factorySuffix;
        Number cached = cacheHelper.getFromCache(cacheKey);
        if (cached != null) return cached.longValue();

        LocalDateTime now = LocalDateTime.now();

        long delayedOrders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(org.springframework.util.StringUtils.hasText(factoryId), ProductionOrder::getFactoryId, factoryId)
                .notIn(ProductionOrder::getStatus, "completed", "cancelled", "scrapped", "closed", "archived")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .count();

        long pendingPurchases = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(MaterialPurchase::getTenantId, tenantId)
                .eq(MaterialPurchase::getStatus, "pending")
                .count();

        long result = delayedOrders + pendingPurchases;
        cacheHelper.putToCache(cacheKey, result);
        return result;
    }

    public List<StyleInfo> listRecentStyles(int limit) {
        if (com.fashion.supplychain.common.UserContext.tenantId() == null) {
            return Collections.emptyList();
        }
        int lim = Math.max(1, limit);
        return styleInfoService.lambdaQuery()
                .select(StyleInfo::getId, StyleInfo::getStyleNo, StyleInfo::getCreateTime)
                .eq(StyleInfo::getStatus, "ENABLED")
                .orderByDesc(StyleInfo::getCreateTime)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    public List<ProductionOrder> listRecentOrders(int limit) {
        if (com.fashion.supplychain.common.UserContext.tenantId() == null) {
            return Collections.emptyList();
        }
        int lim = Math.max(1, limit);
        return productionOrderService.lambdaQuery()
                .select(ProductionOrder::getId, ProductionOrder::getOrderNo, ProductionOrder::getCreateTime)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .orderByDesc(ProductionOrder::getCreateTime)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    public List<MaterialPurchase> listRecentPurchases(int limit) {
        if (com.fashion.supplychain.common.UserContext.tenantId() == null) {
            return Collections.emptyList();
        }
        int lim = Math.max(1, limit);
        return materialPurchaseService.lambdaQuery()
                .select(MaterialPurchase::getId, MaterialPurchase::getPurchaseNo, MaterialPurchase::getCreateTime)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .orderByDesc(MaterialPurchase::getCreateTime)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    public long sumTotalOrderQuantity() {
        Number cached = cacheHelper.getFromCache("totalOrderQuantity");
        if (cached != null) return cached.longValue();
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<ProductionOrder>()
                .select("COALESCE(SUM(COALESCE(order_quantity, 0)), 0) as total")
                .eq("delete_flag", 0);
        long result = cacheHelper.extractLongScalar(productionOrderMapper.selectMaps(qw), "total");
        cacheHelper.putToCache("totalOrderQuantity", result);
        return result;
    }

    public long countOverdueOrders() {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        String factoryId = com.fashion.supplychain.common.UserContext.factoryId();
        String factorySuffix = org.springframework.util.StringUtils.hasText(factoryId) ? "." + factoryId : "";
        String cacheKey = "overdueOrders" + factorySuffix;
        Number cached = cacheHelper.getFromCache(cacheKey);
        if (cached != null) return cached.longValue();
        LocalDateTime now = LocalDateTime.now();
        long result = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(org.springframework.util.StringUtils.hasText(factoryId), ProductionOrder::getFactoryId, factoryId)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived", "scrapped")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .count();
        cacheHelper.putToCache(cacheKey, result);
        return result;
    }

    public List<ProductionOrder> listOverdueOrders(int limit) {
        int lim = Math.max(1, limit);
        LocalDateTime now = LocalDateTime.now();
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        String factoryId = com.fashion.supplychain.common.UserContext.factoryId();
        return productionOrderService.lambdaQuery()
                .select(
                    ProductionOrder::getId,
                    ProductionOrder::getOrderNo,
                    ProductionOrder::getStyleNo,
                    ProductionOrder::getPlannedEndDate,
                    ProductionOrder::getFactoryName,
                    ProductionOrder::getFactoryId,
                    ProductionOrder::getOrderQuantity,
                    ProductionOrder::getMerchandiser,
                    ProductionOrder::getProductionProgress
                )
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(org.springframework.util.StringUtils.hasText(factoryId), ProductionOrder::getFactoryId, factoryId)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived", "scrapped")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .orderBy(true, true, ProductionOrder::getPlannedEndDate)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    public List<ProductionOrder> listAllOverdueOrders() {
        LocalDateTime now = LocalDateTime.now();
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        String factoryId = com.fashion.supplychain.common.UserContext.factoryId();
        return productionOrderService.lambdaQuery()
            .select(
                ProductionOrder::getId,
                ProductionOrder::getOrderNo,
                ProductionOrder::getStyleNo,
                ProductionOrder::getOrderQuantity,
                ProductionOrder::getPlannedEndDate,
                ProductionOrder::getFactoryName,
                ProductionOrder::getFactoryId,
                ProductionOrder::getProductionProgress
            )
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(org.springframework.util.StringUtils.hasText(factoryId), ProductionOrder::getFactoryId, factoryId)
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived", "scrapped")
                .orderByAsc(ProductionOrder::getPlannedEndDate)
                .last("LIMIT 5000")
                .list();
    }

    public long countSampleStylesBetween(LocalDateTime start, LocalDateTime end) {
        return styleInfoService.lambdaQuery()
                .isNotNull(StyleInfo::getSampleStatus)
                .ge(start != null, StyleInfo::getCreateTime, start)
                .le(end != null, StyleInfo::getCreateTime, end)
                .count();
    }

    public long countProductionOrdersBetween(LocalDateTime start, LocalDateTime end) {
        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .ge(start != null, ProductionOrder::getCreateTime, start)
                .le(end != null, ProductionOrder::getCreateTime, end)
                .count();
    }

    public long sumOrderQuantityBetween(LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<ProductionOrder>()
            .select("COALESCE(SUM(COALESCE(order_quantity, 0)), 0) as total")
            .eq("delete_flag", 0)
            .ge(start != null, "create_time", start)
            .le(end != null, "create_time", end);
        return cacheHelper.extractLongScalar(productionOrderMapper.selectMaps(qw), "total");
    }

    public List<Integer> getDailyOrderQuantities(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) return Collections.nCopies(30, 0);
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<ProductionOrder>()
                .select("DATE(create_time) as d", "COALESCE(SUM(COALESCE(order_quantity, 0)), 0) as total")
                .eq("delete_flag", 0)
                .ge(start != null, "create_time", start)
                .le(end != null, "create_time", end)
                .groupBy("DATE(create_time)");
        List<Map<String, Object>> rows = productionOrderMapper.selectMaps(qw);
        java.util.Map<String, Integer> dailyMap = new java.util.HashMap<>();
        for (Map<String, Object> row : rows) {
            String d = String.valueOf(row.get("d") != null ? row.get("d") : row.get("D"));
            long total = ((Number) row.getOrDefault("total", row.getOrDefault("TOTAL", 0))).longValue();
            dailyMap.put(d, (int) total);
        }
        List<Integer> result = new java.util.ArrayList<>();
        for (int i = 0; i < 30; i++) {
            String date = start.plusDays(i).toLocalDate().toString();
            result.add(dailyMap.getOrDefault(date, 0));
        }
        return result;
    }

    // ==================== 延期按环节统计 ====================

    private static final List<String> BULK_STAGES = java.util.List.of("采购", "裁剪", "车缝", "尾部", "二次工艺", "入库");
    private static final List<String> SAMPLE_STAGES = java.util.List.of("纸样开发", "BOM配置", "尺码表", "工序配置", "二次工艺", "生产制单", "样衣制作");

    /**
     * 获取大货生产延期订单，按当前环节分组
     */
    public List<DelayedStageGroup> listDelayedBulkOrdersByStage() {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        String factoryId = com.fashion.supplychain.common.UserContext.factoryId();
        if (tenantId == null) return Collections.emptyList();

        LocalDateTime now = LocalDateTime.now();
        List<ProductionOrder> overdueOrders = productionOrderService.lambdaQuery()
                .select(ProductionOrder::getId, ProductionOrder::getOrderNo, ProductionOrder::getStyleNo,
                        ProductionOrder::getStyleName, ProductionOrder::getFactoryName,
                        ProductionOrder::getOrderQuantity, ProductionOrder::getProductionProgress,
                        ProductionOrder::getPlannedEndDate, ProductionOrder::getStatus,
                        ProductionOrder::getMaterialArrivalRate, ProductionOrder::getProcurementManuallyCompleted)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(org.springframework.util.StringUtils.hasText(factoryId), ProductionOrder::getFactoryId, factoryId)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived", "scrapped")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .orderByAsc(ProductionOrder::getPlannedEndDate)
                .last("LIMIT 5000")
                .list();

        Map<String, DelayedStageGroup> stageMap = new LinkedHashMap<>();
        for (String stage : BULK_STAGES) {
            stageMap.put(stage, new DelayedStageGroup(stage));
        }

        for (ProductionOrder order : overdueOrders) {
            String currentStage = resolveBulkCurrentStage(order);
            // 如果不在预定义环节中，跳过（避免共享引用bug）
            if (!stageMap.containsKey(currentStage)) {
                DelayedStageGroup newGroup = new DelayedStageGroup(currentStage);
                stageMap.put(currentStage, newGroup);
            }
            DelayedStageGroup group = stageMap.get(currentStage);

            DelayedItemDto item = new DelayedItemDto();
            item.setId(order.getId());
            item.setNo(order.getOrderNo());
            item.setName(order.getStyleName() != null ? order.getStyleName() : order.getStyleNo());
            item.setStage(currentStage);
            item.setOverdueDays(order.getPlannedEndDate() != null
                    ? (int) Math.max(0, ChronoUnit.DAYS.between(order.getPlannedEndDate(), now)) : 0);
            item.setPlannedEndDate(order.getPlannedEndDate() != null
                    ? order.getPlannedEndDate().toLocalDate().toString() : "");
            item.setFactoryName(order.getFactoryName());
            item.setType("bulk");
            item.setProgress(order.getProductionProgress() != null ? order.getProductionProgress() : 0);
            item.setQuantity(order.getOrderQuantity());
            group.addItem(item);
        }

        List<DelayedStageGroup> result = new ArrayList<>();
        for (DelayedStageGroup group : stageMap.values()) {
            if (group.getCount() > 0) {
                result.add(group);
            }
        }
        return result;
    }

    /**
     * 根据订单状态推断当前所在环节
     */
    private String resolveBulkCurrentStage(ProductionOrder order) {
        int progress = order.getProductionProgress() == null ? 0 : order.getProductionProgress();
        int materialRate = order.getMaterialArrivalRate() == null ? 0 : order.getMaterialArrivalRate();
        boolean procurementDone = materialRate >= 100
                || (order.getProcurementManuallyCompleted() != null && order.getProcurementManuallyCompleted() == 1);

        if (!procurementDone && progress < 10) return "采购";
        if (progress < 20) return "裁剪";
        if (progress < 60) return "车缝";
        if (progress < 75) return "尾部";
        if (progress < 90) return "二次工艺";
        if (progress < 100) return "入库";
        return "入库";
    }

    /**
     * 获取样衣开发延期款号，按当前开发环节分组
     */
    public List<DelayedStageGroup> listDelayedSampleStylesByStage() {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        if (tenantId == null) return Collections.emptyList();

        LocalDateTime now = LocalDateTime.now();
        // 查询所有未完成的样衣开发款号
        // 只排除已完成的样衣（sampleStatus=COMPLETED），不限制审核状态和完成时间
        // 因为审核通过不代表开发完成，完成时间为空是正常状态
        List<StyleInfo> styles = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getTenantId, tenantId)
                .eq(StyleInfo::getStatus, "ENABLED")
                .isNotNull(StyleInfo::getSampleStatus)
                .ne(StyleInfo::getSampleStatus, "COMPLETED")
                .last("LIMIT 5000")
                .list();

        Map<String, DelayedStageGroup> stageMap = new LinkedHashMap<>();
        for (String stage : SAMPLE_STAGES) {
            stageMap.put(stage, new DelayedStageGroup(stage));
        }

        for (StyleInfo style : styles) {
            String currentStage = resolveSampleCurrentStage(style);
            if (currentStage == null) continue;

            // 判断是否延期：基于当前环节的开始时间
            Integer cycle = style.getCycle();
            boolean isDelayed = false;
            int overdueDays = 0;

            // 获取当前环节的开始时间
            LocalDateTime stageStartTime = resolveSampleStageStartTime(style, currentStage);

            if (stageStartTime != null) {
                // 当前环节已开始，按各环节预算工时判断延期
                int expectedHours = resolveSampleStageExpectedHours(style, currentStage);
                LocalDateTime expectedEnd = stageStartTime.plusHours(expectedHours);
                if (now.isAfter(expectedEnd)) {
                    isDelayed = true;
                    overdueDays = (int) Math.max(1, ChronoUnit.DAYS.between(expectedEnd, now));
                }
            } else if (style.getCreateTime() != null) {
                // 创建超过3天还没开始当前环节
                LocalDateTime expectedStart = style.getCreateTime().plusDays(3);
                if (now.isAfter(expectedStart)) {
                    isDelayed = true;
                    overdueDays = (int) ChronoUnit.DAYS.between(expectedStart, now);
                }
            }

            if (!isDelayed) continue;

            DelayedStageGroup group = stageMap.get(currentStage);
            if (group == null) continue;

            DelayedItemDto item = new DelayedItemDto();
            item.setId(style.getId() != null ? style.getId().toString() : "");
            item.setNo(style.getStyleNo());
            item.setName(style.getStyleName());
            item.setStage(currentStage);
            item.setOverdueDays(overdueDays);
            item.setPlannedEndDate(stageStartTime != null
                    ? stageStartTime.plusHours(resolveSampleStageExpectedHours(style, currentStage)).toLocalDate().toString() : "");
            item.setFactoryName("");
            item.setType("sample");
            item.setProgress(style.getSampleProgress() != null ? style.getSampleProgress() : 0);
            item.setQuantity(0);
            group.addItem(item);
        }

        List<DelayedStageGroup> result = new ArrayList<>();
        for (DelayedStageGroup group : stageMap.values()) {
            if (group.getCount() > 0) {
                result.add(group);
            }
        }
        return result;
    }

    /**
     * 推断样衣开发当前所在环节
     */
    private String resolveSampleCurrentStage(StyleInfo style) {
        // 按开发流程顺序判断：纸样 → BOM → 尺码 → 工序 → 二次工艺 → 生产制单 → 样衣制作
        if (style.getPatternCompletedTime() == null) {
            return "纸样开发";
        }
        if (style.getBomCompletedTime() == null) {
            return "BOM配置";
        }
        if (style.getSizeCompletedTime() == null) {
            return "尺码表";
        }
        if (style.getProcessCompletedTime() == null) {
            return "工序配置";
        }
        if (style.getSecondaryCompletedTime() == null) {
            return "二次工艺";
        }
        if (style.getProductionCompletedTime() == null) {
            return "生产制单";
        }
        // 样衣制作阶段（sampleStatus != COMPLETED）
        return "样衣制作";
    }

    /**
     * 获取样衣开发各环节的开始时间
     */
    private LocalDateTime resolveSampleStageStartTime(StyleInfo style, String stage) {
        switch (stage) {
            case "纸样开发": return style.getPatternStartTime();
            case "BOM配置": return style.getBomStartTime();
            case "尺码表": return style.getSizeStartTime();
            case "工序配置": return style.getProcessStartTime();
            case "二次工艺": return style.getSecondaryStartTime();
            case "生产制单": return style.getProductionStartTime();
            case "样衣制作": return style.getSampleStartTime();
            default: return null;
        }
    }

    /**
     * 获取样衣开发各环节进行中款号统计（不限于延期，所有未完成款号）
     */
    public List<SampleStageStatsDto> getSampleStageStats() {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        if (tenantId == null) return Collections.emptyList();

        List<StyleInfo> styles = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getTenantId, tenantId)
                .eq(StyleInfo::getStatus, "ENABLED")
                .isNotNull(StyleInfo::getSampleStatus)
                .ne(StyleInfo::getSampleStatus, "COMPLETED")
                .select(StyleInfo::getId, StyleInfo::getStyleNo,
                        StyleInfo::getPatternCompletedTime, StyleInfo::getBomCompletedTime,
                        StyleInfo::getSizeCompletedTime, StyleInfo::getProcessCompletedTime,
                        StyleInfo::getSecondaryCompletedTime, StyleInfo::getProductionCompletedTime)
                .last("LIMIT 5000")
                .list();

        Map<String, List<StyleInfo>> stageMap = new LinkedHashMap<>();
        for (String stage : SAMPLE_STAGES) {
            stageMap.put(stage, new ArrayList<>());
        }

        for (StyleInfo style : styles) {
            String currentStage = resolveSampleCurrentStage(style);
            if (currentStage == null) continue;
            if (!stageMap.containsKey(currentStage)) {
                stageMap.put(currentStage, new ArrayList<>());
            }
            stageMap.get(currentStage).add(style);
        }

        List<SampleStageStatsDto> result = new ArrayList<>();
        for (Map.Entry<String, List<StyleInfo>> entry : stageMap.entrySet()) {
            List<StyleInfo> stageStyles = entry.getValue();
            if (stageStyles.isEmpty()) continue;

            SampleStageStatsDto dto = new SampleStageStatsDto();
            dto.setStageName(entry.getKey());
            dto.setCount(stageStyles.size());
            dto.setStyleIds(stageStyles.stream()
                    .map(StyleInfo::getId)
                    .collect(java.util.stream.Collectors.toList()));
            dto.setStyleNos(stageStyles.stream()
                    .map(StyleInfo::getStyleNo)
                    .collect(java.util.stream.Collectors.toList()));
            result.add(dto);
        }
        return result;
    }

    /**
     * 获取样衣开发各环节的预期工时（小时）
     * 优先使用预算工时，否则使用默认值
     */
    private int resolveSampleStageExpectedHours(StyleInfo style, String stage) {
        switch (stage) {
            case "纸样开发":
                return style.getPatternBudgetHours() != null ? style.getPatternBudgetHours() : 48; // 默认2天
            case "BOM配置":
                return style.getBomBudgetHours() != null ? style.getBomBudgetHours() : 24; // 默认1天
            case "尺码表":
                return style.getSizeBudgetHours() != null ? style.getSizeBudgetHours() : 24;
            case "工序配置":
                return style.getProcessBudgetHours() != null ? style.getProcessBudgetHours() : 24;
            case "二次工艺":
                return style.getSecondaryBudgetHours() != null ? style.getSecondaryBudgetHours() : 24;
            case "生产制单":
                return style.getProductionBudgetHours() != null ? style.getProductionBudgetHours() : 24;
            case "样衣制作": {
                // 样衣制作使用 cycle 天数
                Integer cycle = style.getCycle();
                return cycle != null ? cycle * 24 : 360; // 默认15天
            }
            default: return 48;
        }
    }
}
