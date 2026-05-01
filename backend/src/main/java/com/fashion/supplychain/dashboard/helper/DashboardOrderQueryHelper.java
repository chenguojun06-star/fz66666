package com.fashion.supplychain.dashboard.helper;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.time.LocalDateTime;
import java.util.Collections;
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
}
