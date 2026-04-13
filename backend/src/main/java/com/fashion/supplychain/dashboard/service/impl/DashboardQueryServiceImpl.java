package com.fashion.supplychain.dashboard.service.impl;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.service.RedisService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class DashboardQueryServiceImpl implements DashboardQueryService {

    /** 仪表盘缓存前缀 */
    private static final String CACHE_PREFIX = "dashboard:";
    /** 统计数据缓存5分钟（高频展示，低实时性要求） */
    private static final long CACHE_TTL_MINUTES = 5;

    private final StyleInfoService styleInfoService;
    private final ProductionOrderService productionOrderService;
    private final CuttingTaskService cuttingTaskService;
    private final MaterialReconciliationService materialReconciliationService;
    private final ShipmentReconciliationService shipmentReconciliationService;
    private final ScanRecordService scanRecordService;
    private final MaterialPurchaseService materialPurchaseService;
    private final ProductWarehousingService productWarehousingService;
    private final ProductionOrderMapper productionOrderMapper;
    private final ProductWarehousingMapper productWarehousingMapper;
    private final ProductOutstockService productOutstockService;
    private final RedisService redisService;

    public DashboardQueryServiceImpl(
            StyleInfoService styleInfoService,
            ProductionOrderService productionOrderService,
            CuttingTaskService cuttingTaskService,
            MaterialReconciliationService materialReconciliationService,
            ShipmentReconciliationService shipmentReconciliationService,
            ScanRecordService scanRecordService,
            MaterialPurchaseService materialPurchaseService,
            ProductWarehousingService productWarehousingService,
            ProductionOrderMapper productionOrderMapper,
            ProductWarehousingMapper productWarehousingMapper,
            ProductOutstockService productOutstockService,
            RedisService redisService) {
        this.styleInfoService = styleInfoService;
        this.productionOrderService = productionOrderService;
        this.cuttingTaskService = cuttingTaskService;
        this.materialReconciliationService = materialReconciliationService;
        this.shipmentReconciliationService = shipmentReconciliationService;
        this.scanRecordService = scanRecordService;
        this.materialPurchaseService = materialPurchaseService;
        this.productWarehousingService = productWarehousingService;
        this.productionOrderMapper = productionOrderMapper;
        this.productWarehousingMapper = productWarehousingMapper;
        this.productOutstockService = productOutstockService;
        this.redisService = redisService;
    }

    /**
     * 构建租户隔离的缓存 key。
     * 超级管理员（tenantId=null）使用 "superadmin:" 前缀，避免污染任何租户的缓存。
     */
    private String tenantCacheKey(String key) {
        Long tenantId = UserContext.tenantId();
        String prefix = tenantId != null ? "t" + tenantId + ":" : "superadmin:";
        return CACHE_PREFIX + prefix + key;
    }

    /** 从缓存获取，命中则直接返回；未命中返回null */
    private <T> T getFromCache(String key) {
        try {
            return redisService.get(tenantCacheKey(key));
        } catch (Exception e) {
            log.debug("Redis cache miss or error for key: {}", key);
            return null;
        }
    }

    /** 写入缓存 */
    private void putToCache(String key, Object value) {
        try {
            redisService.set(tenantCacheKey(key), value, CACHE_TTL_MINUTES, TimeUnit.MINUTES);
        } catch (Exception e) {
            log.debug("Redis cache put error for key: {}", key);
        }
    }

    @Override
    public long countEnabledStyles() {
        Number cached = getFromCache("enabledStyles");
        if (cached != null) return cached.longValue();
        long result = styleInfoService.lambdaQuery().eq(StyleInfo::getStatus, "ENABLED").count();
        putToCache("enabledStyles", result);
        return result;
    }

    @Override
    public long countProductionOrders() {
        Number cached = getFromCache("productionOrders");
        if (cached != null) return cached.longValue();
        // 统计生产中订单：排除已关闭、已完成、已取消、已归档、已报废的订单
        long result = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived", "scrapped")
                .count();
        putToCache("productionOrders", result);
        return result;
    }

    @Override
    public long countPendingMaterialReconciliations() {
        Number cached = getFromCache("pendingMaterialRecon");
        if (cached != null) return cached.longValue();
        long result = materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .eq(MaterialReconciliation::getStatus, "pending")
                .count();
        putToCache("pendingMaterialRecon", result);
        return result;
    }

    @Override
    public long countPendingShipmentReconciliations() {
        return shipmentReconciliationService.lambdaQuery().eq(ShipmentReconciliation::getStatus, "pending").count();
    }

    @Override
    public long countApprovedMaterialReconciliations() {
        return materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .eq(MaterialReconciliation::getStatus, "approved")
                .count();
    }

    @Override
    public long countApprovedShipmentReconciliations() {
        return shipmentReconciliationService.lambdaQuery().eq(ShipmentReconciliation::getStatus, "approved").count();
    }

    @Override
    public long countScansBetween(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            return 0;
        }
        return scanRecordService.lambdaQuery().between(ScanRecord::getScanTime, start, end).count();
    }

    @Override
    public long countWarehousingBetween(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            return 0;
        }
        return productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .between(ProductWarehousing::getCreateTime, start, end)
                .count();
    }

    @Override
    public long sumUnqualifiedQuantityBetween(LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ProductWarehousing> qw = new QueryWrapper<ProductWarehousing>()
                .select("COALESCE(SUM(unqualified_quantity), 0) as total")
                .eq("delete_flag", 0)
                .ge(start != null, "create_time", start)
                .le(end != null, "create_time", end);
        List<Map<String, Object>> rows = productWarehousingMapper.selectMaps(qw);
        Map<String, Object> first = (rows == null || rows.isEmpty()) ? null : rows.get(0);
        Object v = first == null ? null : (first.get("total") == null ? first.get("TOTAL") : first.get("total"));
        if (v == null) {
            return 0;
        }
        if (v instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (Exception e) {
            return 0;
        }
    }

    @Override
    public long countUrgentEvents() {
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId(); // 🔒 工厂账号只看自己工厂的数据
        String factorySuffix = org.springframework.util.StringUtils.hasText(factoryId) ? "." + factoryId : "";
        String cacheKey = "urgentEvents" + factorySuffix;
        Number cached = getFromCache(cacheKey);
        if (cached != null) return cached.longValue();

        LocalDateTime now = LocalDateTime.now();

        // 1. 订单超期：已超过计划结束日期但未完成的订单
        long delayedOrders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(tenantId != null, ProductionOrder::getTenantId, tenantId)                                                          // 🔒 租户隔离
                .eq(org.springframework.util.StringUtils.hasText(factoryId), ProductionOrder::getFactoryId, factoryId)                // 🔒 工厂隔离
                .ne(ProductionOrder::getStatus, "completed")
                .ne(ProductionOrder::getStatus, "cancelled")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .count();

        // 2. 面料采购待处理：状态为pending的采购单
        long pendingPurchases = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(tenantId != null, MaterialPurchase::getTenantId, tenantId)                                                         // 🔒 租户隔离
                .eq(MaterialPurchase::getStatus, "pending")
                .count();

        long result = delayedOrders + pendingPurchases;
        putToCache(cacheKey, result);
        return result;
    }

    @Override
    public List<StyleInfo> listRecentStyles(int limit) {
        // 超级管理员无归属租户，不展示任何租户的业务数据
        if (UserContext.tenantId() == null) {
            return java.util.Collections.emptyList();
        }
        int lim = Math.max(1, limit);
        // TenantInterceptor 已自动追加 tenant_id 条件
        return styleInfoService.lambdaQuery()
                .select(StyleInfo::getId, StyleInfo::getStyleNo, StyleInfo::getCreateTime)
                .eq(StyleInfo::getStatus, "ENABLED")
                .orderByDesc(StyleInfo::getCreateTime)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    @Override
    public List<ProductionOrder> listRecentOrders(int limit) {
        if (UserContext.tenantId() == null) {
            return java.util.Collections.emptyList();
        }
        int lim = Math.max(1, limit);
        return productionOrderService.lambdaQuery()
                .select(ProductionOrder::getId, ProductionOrder::getOrderNo, ProductionOrder::getCreateTime)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .orderByDesc(ProductionOrder::getCreateTime)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    @Override
    public List<ScanRecord> listRecentScans(int limit) {
        if (UserContext.tenantId() == null) {
            return java.util.Collections.emptyList();
        }
        int lim = Math.max(1, limit);
        // 仅显示真实用户扫码操作：
        // 1. 排除 operator_name="system" 或 operator_id 为空的记录
        // 2. 排除定时任务/进度重算自动生成的阶段记录（ORDER_PROCUREMENT / ORDER_CREATED / ORDER_OP / ORCH_FAIL 等）
        //    这些系统记录的 request_id 以 "ORDER_" 或 "ORCH_" 开头
        return scanRecordService.lambdaQuery()
                .select(ScanRecord::getId, ScanRecord::getOrderNo, ScanRecord::getScanTime)
                .ne(ScanRecord::getOperatorName, "system")
                .isNotNull(ScanRecord::getOperatorId)
                .and(w -> w
                        .isNull(ScanRecord::getRequestId)
                        .or()
                        .notLikeRight(ScanRecord::getRequestId, "ORDER_")
                )
                .and(w -> w
                        .isNull(ScanRecord::getRequestId)
                        .or()
                        .notLikeRight(ScanRecord::getRequestId, "ORCH_")
                )
                .orderByDesc(ScanRecord::getScanTime)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    @Override
    public List<MaterialPurchase> listRecentPurchases(int limit) {
        if (UserContext.tenantId() == null) {
            return java.util.Collections.emptyList();
        }
        int lim = Math.max(1, limit);
        return materialPurchaseService.lambdaQuery()
                .select(MaterialPurchase::getId, MaterialPurchase::getPurchaseNo, MaterialPurchase::getCreateTime)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .orderByDesc(MaterialPurchase::getCreateTime)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    @Override
    public long sumTotalOrderQuantity() {
        Number cached = getFromCache("totalOrderQuantity");
        if (cached != null) return cached.longValue();
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<ProductionOrder>()
                .select("COALESCE(SUM(COALESCE(order_quantity, 0)), 0) as total")
                .eq("delete_flag", 0);
        long result = extractLongScalar(productionOrderMapper.selectMaps(qw), "total");
        putToCache("totalOrderQuantity", result);
        return result;
    }

    @Override
    public long countOverdueOrders() {
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId(); // 🔒 工厂账号只看自己工厂的数据
        String factorySuffix = org.springframework.util.StringUtils.hasText(factoryId) ? "." + factoryId : "";
        String cacheKey = "overdueOrders" + factorySuffix;
        Number cached = getFromCache(cacheKey);
        if (cached != null) return cached.longValue();
        // 计算延期订单：计划结束日期已过且处于生产中的订单（排除已关闭/已完成/已取消/已归档）
        LocalDateTime now = LocalDateTime.now();
        long result = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(tenantId != null, ProductionOrder::getTenantId, tenantId)                                                          // 🔒 租户隔离
                .eq(org.springframework.util.StringUtils.hasText(factoryId), ProductionOrder::getFactoryId, factoryId)                // 🔒 工厂隔离
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived", "scrapped", "pending")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .count();
        putToCache(cacheKey, result);
        return result;
    }

    @Override
    public long countTotalWarehousing() {
        // 统计所有入库记录的总数
        return productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .count();
    }

    @Override
    public List<ProductionOrder> listOverdueOrders(int limit) {
        // 获取延期订单列表（仅包含生产中订单）
        int lim = Math.max(1, limit);
        LocalDateTime now = LocalDateTime.now();
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId(); // 🔒 工厂账号只看自己工厂的数据
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
                .eq(tenantId != null, ProductionOrder::getTenantId, tenantId)  // 🔒 租户隔离
                .eq(org.springframework.util.StringUtils.hasText(factoryId), ProductionOrder::getFactoryId, factoryId)  // 🔒 工厂隔离
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived", "scrapped", "pending")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .orderBy(true, true, ProductionOrder::getPlannedEndDate)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    @Override
    public long sumTotalQualifiedQuantity() {
        QueryWrapper<ProductWarehousing> qw = new QueryWrapper<ProductWarehousing>()
                .select("COALESCE(SUM(COALESCE(qualified_quantity, 0)), 0) as total")
                .eq("delete_flag", 0);
        return extractLongScalar(productWarehousingMapper.selectMaps(qw), "total");
    }

    @Override
    public long sumTotalUnqualifiedQuantity() {
        QueryWrapper<ProductWarehousing> qw = new QueryWrapper<ProductWarehousing>()
                .select("COALESCE(SUM(COALESCE(unqualified_quantity, 0)), 0) as total")
                .eq("delete_flag", 0);
        return extractLongScalar(productWarehousingMapper.selectMaps(qw), "total");
    }

    @Override
    public long countRepairIssues() {
        // 统计返修问题数量（根据实际业务逻辑调整）
        // 这里统计次品备注中包含"返修"关键字的记录数
        return productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .like(ProductWarehousing::getDefectRemark, "返修")
                .count();
    }

    @Override
    public long sumQualifiedQuantityBetween(LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ProductWarehousing> qw = new QueryWrapper<ProductWarehousing>()
                .select("COALESCE(SUM(COALESCE(qualified_quantity, 0)), 0) as total")
                .eq("delete_flag", 0)
                .ge(start != null, "warehousing_end_time", start)
                .le(end != null, "warehousing_end_time", end);
        return extractLongScalar(productWarehousingMapper.selectMaps(qw), "total");
    }

    @Override
    public long countRepairIssuesBetween(LocalDateTime start, LocalDateTime end) {
        // 统计指定时间范围内的返修问题数量
        return productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .ge(start != null, ProductWarehousing::getWarehousingEndTime, start)
                .le(end != null, ProductWarehousing::getWarehousingEndTime, end)
                .like(ProductWarehousing::getDefectRemark, "返修")
                .count();
    }

    @Override
    public long countSampleStylesBetween(LocalDateTime start, LocalDateTime end) {
        // 统计样衣开发数量：sampleStatus不为空且在时间范围内创建的款号
        return styleInfoService.lambdaQuery()
                .isNotNull(StyleInfo::getSampleStatus)
                .ge(start != null, StyleInfo::getCreateTime, start)
                .le(end != null, StyleInfo::getCreateTime, end)
                .count();
    }

    @Override
    public long countProductionOrdersBetween(LocalDateTime start, LocalDateTime end) {
        // 统计大货下单数量：在时间范围内创建的所有生产订单（包括已完成订单）
        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .ge(start != null, ProductionOrder::getCreateTime, start)
                .le(end != null, ProductionOrder::getCreateTime, end)
                .count();
    }

    @Override
    public long sumOrderQuantityBetween(LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<ProductionOrder>()
            .select("COALESCE(SUM(COALESCE(order_quantity, 0)), 0) as total")
            .eq("delete_flag", 0)
            .ge(start != null, "create_time", start)
            .le(end != null, "create_time", end);
        return extractLongScalar(productionOrderMapper.selectMaps(qw), "total");
    }

    @Override
    public long sumCuttingQuantityBetween(LocalDateTime start, LocalDateTime end) {
        // 统计裁剪数量：仅统计已完成（bundled）的裁剪任务
        List<CuttingTask> tasks = cuttingTaskService.lambdaQuery()
                .select(CuttingTask::getOrderQuantity)
                .eq(CuttingTask::getStatus, "bundled")  // 仅统计已完成的任务
                .ge(start != null, CuttingTask::getBundledTime, start)  // 使用完成时间
                .le(end != null, CuttingTask::getBundledTime, end)
                .isNotNull(CuttingTask::getBundledTime)
                .isNotNull(CuttingTask::getOrderQuantity)
                .list();

        long total = tasks.stream()
                .mapToInt(CuttingTask::getOrderQuantity)
                .sum();

        log.info("裁剪数量统计 - 开始时间: {}, 结束时间: {}, 已完成任务数: {}, 总数量: {}",
                start, end, tasks.size(), total);

        return total;
    }

    @Override
    public long sumWarehousingQuantityBetween(LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ProductWarehousing> qw = new QueryWrapper<ProductWarehousing>()
                .select("COALESCE(SUM(COALESCE(qualified_quantity, 0) + COALESCE(unqualified_quantity, 0)), 0) as total")
                .eq("delete_flag", 0)
                .ge(start != null, "warehousing_end_time", start)
                .le(end != null, "warehousing_end_time", end);
        return extractLongScalar(productWarehousingMapper.selectMaps(qw), "total");
    }

    private long extractLongScalar(List<Map<String, Object>> rows, String fieldName) {
        Map<String, Object> first = (rows == null || rows.isEmpty()) ? null : rows.get(0);
        Object value = first == null ? null : first.get(fieldName);
        if (value == null && first != null) {
            value = first.get(fieldName.toUpperCase());
        }
        if (value == null) {
            return 0;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (Exception e) {
            return 0;
        }
    }

    @Override
    public long countOutstockBetween(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            return 0;
        }
        return productOutstockService.lambdaQuery()
                .eq(ProductOutstock::getDeleteFlag, 0)
                .between(ProductOutstock::getCreateTime, start, end)
                .count();
    }

    @Override
    public long sumOutstockQuantityBetween(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            return 0;
        }
        QueryWrapper<ProductOutstock> qw = new QueryWrapper<ProductOutstock>()
                .select("COALESCE(SUM(COALESCE(outstock_quantity, 0)), 0) as total")
                .eq("delete_flag", 0)
                .between("create_time", start, end);
        return extractLongScalar(productOutstockService.getBaseMapper().selectMaps(qw), "total");
    }

    @Override
    public List<Integer> getDailyOrderQuantities(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) return java.util.Collections.nCopies(30, 0);
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

    @Override
    public List<Integer> getDailyCuttingQuantities(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) return java.util.Collections.nCopies(30, 0);
        QueryWrapper<CuttingTask> qw = new QueryWrapper<CuttingTask>()
                .select("DATE(bundled_time) as d", "COALESCE(SUM(COALESCE(order_quantity, 0)), 0) as total")
                .eq("status", "bundled")
                .ge(start != null, "bundled_time", start)
                .le(end != null, "bundled_time", end)
                .isNotNull("bundled_time")
                .isNotNull("order_quantity")
                .groupBy("DATE(bundled_time)");
        List<Map<String, Object>> rows = cuttingTaskService.getBaseMapper().selectMaps(qw);
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

    @Override
    public List<Integer> getDailyScanCounts(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) return java.util.Collections.nCopies(30, 0);
        QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                .select("DATE(scan_time) as d", "COUNT(*) as total")
                .ge("scan_time", start)
                .le("scan_time", end)
                .eq("scan_result", "success")
                .ne("operator_name", "system")
                .isNotNull("operator_id")
                .isNotNull("scan_time")
                .groupBy("DATE(scan_time)");
        List<Map<String, Object>> rows = scanRecordService.getBaseMapper().selectMaps(qw);
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

    @Override
    public List<Integer> getDailyScanQuantities(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) return java.util.Collections.nCopies(30, 0);
        QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                .select("DATE(scan_time) as d", "COALESCE(SUM(COALESCE(quantity, 0)), 0) as total")
                .ge("scan_time", start)
                .le("scan_time", end)
                .eq("scan_result", "success")
                .ne("operator_name", "system")
                .isNotNull("operator_id")
                .isNotNull("scan_time")
                .groupBy("DATE(scan_time)");
        List<Map<String, Object>> rows = scanRecordService.getBaseMapper().selectMaps(qw);
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

    @Override
    public List<ProductionOrder> listAllOverdueOrders() {
        // 获取所有延期订单：交货日期 < 今天 且 生产中（排除已关闭/已完成/已取消/已归档）
        LocalDateTime now = LocalDateTime.now();
        return productionOrderService.lambdaQuery()
            .select(
                ProductionOrder::getId,
                ProductionOrder::getOrderNo,
                ProductionOrder::getStyleNo,
                ProductionOrder::getOrderQuantity,
                ProductionOrder::getPlannedEndDate,
                ProductionOrder::getFactoryName
            )
                .eq(ProductionOrder::getDeleteFlag, 0)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived", "scrapped")
                .orderByAsc(ProductionOrder::getPlannedEndDate)
                .list();
    }

    @Override
    public long sumTodayScanQuantity() {
        LocalDate today = LocalDate.now();
        LocalDateTime startOfDay = LocalDateTime.of(today, LocalTime.MIN);
        LocalDateTime endOfDay = LocalDateTime.of(today, LocalTime.MAX);
        QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                .select("COALESCE(SUM(COALESCE(quantity, 0)), 0) as total")
                .ge("scan_time", startOfDay)
                .le("scan_time", endOfDay);
        return extractLongScalar(scanRecordService.getBaseMapper().selectMaps(qw), "total");
    }

    @Override
    public long sumTotalScanQuantity() {
        QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                .select("COALESCE(SUM(COALESCE(quantity, 0)), 0) as total");
        return extractLongScalar(scanRecordService.getBaseMapper().selectMaps(qw), "total");
    }
}
