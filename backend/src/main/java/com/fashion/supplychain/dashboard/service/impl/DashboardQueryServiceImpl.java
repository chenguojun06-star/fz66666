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
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
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
    private final ProductWarehousingMapper productWarehousingMapper;
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
            ProductWarehousingMapper productWarehousingMapper,
            RedisService redisService) {
        this.styleInfoService = styleInfoService;
        this.productionOrderService = productionOrderService;
        this.cuttingTaskService = cuttingTaskService;
        this.materialReconciliationService = materialReconciliationService;
        this.shipmentReconciliationService = shipmentReconciliationService;
        this.scanRecordService = scanRecordService;
        this.materialPurchaseService = materialPurchaseService;
        this.productWarehousingService = productWarehousingService;
        this.productWarehousingMapper = productWarehousingMapper;
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
    @SuppressWarnings("unchecked")
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
        // 统计生产中订单：排除已关闭、已完成、已取消、已归档的订单
        long result = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived")
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
        try {
            return scanRecordService.lambdaQuery().between(ScanRecord::getScanTime, start, end).count();
        } catch (Exception e) {
            log.warn("countScansBetween失败（可能DB列缺失）: {}", e.getMessage());
            return 0;
        }
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
        Number cached = getFromCache("urgentEvents");
        if (cached != null) return cached.longValue();

        LocalDateTime now = LocalDateTime.now();

        // 1. 订单超期：已超过计划结束日期但未完成的订单
        long delayedOrders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .ne(ProductionOrder::getStatus, "completed")
                .ne(ProductionOrder::getStatus, "cancelled")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .count();

        // 2. 面料采购待处理：状态为pending的采购单
        long pendingPurchases = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(MaterialPurchase::getStatus, "pending")
                .count();

        long result = delayedOrders + pendingPurchases;
        putToCache("urgentEvents", result);
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
        try {
            // 仅显示真实扫码操作，排除系统自动创建的记录；TenantInterceptor 追加 tenant_id 条件
            return scanRecordService.lambdaQuery()
                    .ne(ScanRecord::getOperatorName, "system")
                    .isNotNull(ScanRecord::getOperatorId)
                    .orderByDesc(ScanRecord::getScanTime)
                    .page(new Page<>(1, lim))
                    .getRecords();
        } catch (Exception e) {
            log.warn("listRecentScans失败（可能DB列缺失）: {}", e.getMessage());
            return java.util.Collections.emptyList();
        }
    }

    @Override
    public List<MaterialPurchase> listRecentPurchases(int limit) {
        if (UserContext.tenantId() == null) {
            return java.util.Collections.emptyList();
        }
        int lim = Math.max(1, limit);
        return materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .orderByDesc(MaterialPurchase::getCreateTime)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    @Override
    public long sumTotalOrderQuantity() {
        Number cached = getFromCache("totalOrderQuantity");
        if (cached != null) return cached.longValue();
        // 计算所有生产订单的总数量（包括已完成订单，与小程序和PC端保持一致）
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .select(ProductionOrder::getOrderQuantity)
                .list();
        long result = orders.stream()
                .mapToLong(order -> order.getOrderQuantity() != null ? order.getOrderQuantity() : 0L)
                .sum();
        putToCache("totalOrderQuantity", result);
        return result;
    }

    @Override
    public long countOverdueOrders() {
        Number cached = getFromCache("overdueOrders");
        if (cached != null) return cached.longValue();
        // 计算延期订单：计划结束日期已过且处于生产中的订单（排除已关闭/已完成/已取消/已归档）
        LocalDateTime now = LocalDateTime.now();
        long result = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .count();
        putToCache("overdueOrders", result);
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
        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .orderBy(true, true, ProductionOrder::getPlannedEndDate)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    @Override
    public long sumTotalQualifiedQuantity() {
        // 统计所有合格品数量
        List<ProductWarehousing> warehouses = productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .select(ProductWarehousing::getQualifiedQuantity)
                .list();
        return warehouses.stream()
                .mapToLong(w -> w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0L)
                .sum();
    }

    @Override
    public long sumTotalUnqualifiedQuantity() {
        // 统计所有次品数量
        List<ProductWarehousing> warehouses = productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .select(ProductWarehousing::getUnqualifiedQuantity)
                .list();
        return warehouses.stream()
                .mapToLong(w -> w.getUnqualifiedQuantity() != null ? w.getUnqualifiedQuantity() : 0L)
                .sum();
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
        // 统计指定时间范围内的合格品数量
        List<ProductWarehousing> warehouses = productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .ge(start != null, ProductWarehousing::getWarehousingEndTime, start)
                .le(end != null, ProductWarehousing::getWarehousingEndTime, end)
                .select(ProductWarehousing::getQualifiedQuantity)
                .list();
        return warehouses.stream()
                .mapToLong(w -> w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0L)
                .sum();
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
        // 统计订单数量总和：时间范围内所有订单的orderQuantity之和（包括已完成订单）
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .ge(start != null, ProductionOrder::getCreateTime, start)
                .le(end != null, ProductionOrder::getCreateTime, end)
                .select(ProductionOrder::getOrderQuantity)
                .list();
        return orders.stream()
                .mapToLong(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0L)
                .sum();
    }

    @Override
    public long sumCuttingQuantityBetween(LocalDateTime start, LocalDateTime end) {
        // 统计裁剪数量：仅统计已完成（bundled）的裁剪任务
        List<CuttingTask> tasks = cuttingTaskService.lambdaQuery()
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
        // 统计出入库数量：质检入库的 qualifiedQuantity + unqualifiedQuantity
        List<ProductWarehousing> warehousing = productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .ge(start != null, ProductWarehousing::getWarehousingEndTime, start)
                .le(end != null, ProductWarehousing::getWarehousingEndTime, end)
                .list();

        return warehousing.stream()
                .mapToInt(w -> w.getQualifiedQuantity() + w.getUnqualifiedQuantity())
                .sum();
    }

    @Override
    public List<Integer> getDailyOrderQuantities(LocalDateTime start, LocalDateTime end) {
        // 获取每天的订单总数量
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .ge(start != null, ProductionOrder::getCreateTime, start)
                .le(end != null, ProductionOrder::getCreateTime, end)
                .orderByAsc(ProductionOrder::getCreateTime)
                .list();

        // 按日期分组统计数量
        Map<String, Integer> dailyQuantities = new java.util.HashMap<>();
        for (ProductionOrder order : orders) {
            String date = order.getCreateTime().toLocalDate().toString();
            int quantity = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
            dailyQuantities.merge(date, quantity, Integer::sum);
        }

        // 生成完整的30天数据列表
        List<Integer> result = new java.util.ArrayList<>();
        for (int i = 0; i < 30; i++) {
            String date = start.plusDays(i).toLocalDate().toString();
            result.add(dailyQuantities.getOrDefault(date, 0));
        }
        return result;
    }

    @Override
    public List<Integer> getDailyCuttingQuantities(LocalDateTime start, LocalDateTime end) {
        // 获取每天的裁剪总数量：只统计已完成（status='bundled'）的裁剪任务
        // 使用完成时间（bundledTime）而不是创建时间
        log.debug("查询裁剪数量: start={}, end={}", start, end);

        List<CuttingTask> tasks = cuttingTaskService.lambdaQuery()
                .eq(CuttingTask::getStatus, "bundled")  // 只统计已完成的裁剪任务
                .ge(start != null, CuttingTask::getBundledTime, start)
                .le(end != null, CuttingTask::getBundledTime, end)
                .isNotNull(CuttingTask::getBundledTime)  // 必须有完成时间
                .isNotNull(CuttingTask::getOrderQuantity)
                .orderByAsc(CuttingTask::getBundledTime)
                .list();

        log.debug("查询到{}条已完成的裁剪任务", tasks.size());
        if (!tasks.isEmpty()) {
            log.info("前3条数据: {}", tasks.stream().limit(3).map(t ->
                String.format("[%s: %d件, bundled=%s]", t.getProductionOrderNo(), t.getOrderQuantity(), t.getBundledTime())
            ).toList());
        }

        // 按日期分组统计数量（使用完成日期）
        Map<String, Integer> dailyQuantities = new java.util.HashMap<>();
        for (CuttingTask task : tasks) {
            String date = task.getBundledTime().toLocalDate().toString();
            int quantity = task.getOrderQuantity();
            dailyQuantities.merge(date, quantity, Integer::sum);
        }

        log.info("按日期分组后: {}", dailyQuantities);

        // 生成完整的30天数据列表
        List<Integer> result = new java.util.ArrayList<>();
        for (int i = 0; i < 30; i++) {
            String date = start.plusDays(i).toLocalDate().toString();
            result.add(dailyQuantities.getOrDefault(date, 0));
        }

        log.info("最终30天裁剪数量: {}", result);
        return result;
    }

    @Override
    public List<Integer> getDailyScanCounts(LocalDateTime start, LocalDateTime end) {
        // 获取每天的扫菲次数：只统计真实的扫码操作（排除系统自动创建的记录）
        // 判断标准：operator_name != 'system' 且 operator_id 不为空
        log.debug("查询扫菲次数: start={}, end={}", start, end);

        List<ScanRecord> scans;
        try {
            scans = scanRecordService.lambdaQuery()
                .ge(start != null, ScanRecord::getScanTime, start)
                .le(end != null, ScanRecord::getScanTime, end)
                .isNotNull(ScanRecord::getOperatorName)     // 必须有操作人名称
                .ne(ScanRecord::getOperatorName, "system")  // 排除系统自动创建的记录
                .isNotNull(ScanRecord::getOperatorId)       // 必须有真实操作人ID
                .ne(ScanRecord::getOperatorId, "")          // 操作人ID不能为空字符串
                .isNotNull(ScanRecord::getScanTime)         // 必须有扫码时间
                .orderByAsc(ScanRecord::getScanTime)
                .list();
        } catch (Exception e) {
            log.warn("getDailyScanCounts查询扫码记录失败（可能DB列缺失）: {}", e.getMessage());
            scans = java.util.Collections.emptyList();
        }

        log.info("查询到{}条真实扫码记录", scans.size());
        if (!scans.isEmpty()) {
            log.info("前3条: {}", scans.stream().limit(3).map(s ->
                String.format("[订单=%s, 类型=%s, 操作人=%s, 操作人ID=%s]",
                    s.getOrderNo(), s.getScanType(), s.getOperatorName(), s.getOperatorId())
            ).toList());

            // 调试：打印所有记录的operator信息
            long systemCount = scans.stream().filter(s -> "system".equals(s.getOperatorName())).count();
            long nullNameCount = scans.stream().filter(s -> s.getOperatorName() == null).count();
            long nullIdCount = scans.stream().filter(s -> s.getOperatorId() == null).count();
            long emptyIdCount = scans.stream().filter(s -> "".equals(s.getOperatorId())).count();
            log.warn("过滤结果异常 - system: {}, nullName: {}, nullId: {}, emptyId: {}",
                systemCount, nullNameCount, nullIdCount, emptyIdCount);
        }

        // 按日期分组统计次数
        Map<String, Integer> dailyCounts = new java.util.HashMap<>();
        for (ScanRecord scan : scans) {
            String date = scan.getScanTime().toLocalDate().toString();
            dailyCounts.merge(date, 1, Integer::sum);
        }

        log.info("按日期分组扫菲次数: {}", dailyCounts);

        // 生成完整的30天数据列表
        List<Integer> result = new java.util.ArrayList<>();
        for (int i = 0; i < 30; i++) {
            String date = start.plusDays(i).toLocalDate().toString();
            result.add(dailyCounts.getOrDefault(date, 0));
        }

        log.info("最终30天扫菲次数: {}", result);
        return result;
    }

    @Override
    public List<Integer> getDailyScanQuantities(LocalDateTime start, LocalDateTime end) {
        // 获取每天的扫菲数量：只统计真实的扫码操作（排除系统自动创建的记录）
        // 判断标准：operator_name != 'system' 且 operator_id 不为空
        log.debug("查询扫菲数量: start={}, end={}", start, end);

        List<ScanRecord> scans;
        try {
            scans = scanRecordService.lambdaQuery()
                .ge(start != null, ScanRecord::getScanTime, start)
                .le(end != null, ScanRecord::getScanTime, end)
                .isNotNull(ScanRecord::getOperatorName)
                .ne(ScanRecord::getOperatorName, "system")
                .isNotNull(ScanRecord::getOperatorId)
                .ne(ScanRecord::getOperatorId, "")
                .isNotNull(ScanRecord::getScanTime)
                .orderByAsc(ScanRecord::getScanTime)
                .list();
        } catch (Exception e) {
            log.warn("getDailyScanQuantities查询失败（可能DB列缺失）: {}", e.getMessage());
            scans = java.util.Collections.emptyList();
        }

        log.debug("查询到{}条真实扫码记录", scans.size());

        // 按日期分组统计数量
        Map<String, Integer> dailyQuantities = new java.util.HashMap<>();
        for (ScanRecord scan : scans) {
            String date = scan.getScanTime().toLocalDate().toString();
            Integer quantity = scan.getQuantity() != null ? scan.getQuantity() : 0;
            dailyQuantities.merge(date, quantity, Integer::sum);
        }

        log.info("按日期分组扫菲数量: {}", dailyQuantities);

        // 生成完整的30天数据列表
        List<Integer> result = new java.util.ArrayList<>();
        for (int i = 0; i < 30; i++) {
            String date = start.plusDays(i).toLocalDate().toString();
            result.add(dailyQuantities.getOrDefault(date, 0));
        }

        log.info("最终30天扫菲数量: {}", result);
        return result;
    }

    @Override
    public List<ProductionOrder> listAllOverdueOrders() {
        // 获取所有延期订单：交货日期 < 今天 且 生产中（排除已关闭/已完成/已取消/已归档）
        LocalDateTime now = LocalDateTime.now();
        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .lt(ProductionOrder::getPlannedEndDate, now)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived")
                .orderByAsc(ProductionOrder::getPlannedEndDate)
                .list();
    }

    @Override
    public long sumTodayScanQuantity() {
        LocalDate today = LocalDate.now();
        LocalDateTime startOfDay = LocalDateTime.of(today, LocalTime.MIN);
        LocalDateTime endOfDay = LocalDateTime.of(today, LocalTime.MAX);
        try {
            List<ScanRecord> scans = scanRecordService.lambdaQuery()
                    .ge(ScanRecord::getScanTime, startOfDay)
                    .le(ScanRecord::getScanTime, endOfDay)
                    .select(ScanRecord::getQuantity)
                    .list();
            return scans.stream()
                    .mapToLong(s -> s.getQuantity() != null ? s.getQuantity() : 0L)
                    .sum();
        } catch (Exception e) {
            log.warn("sumTodayScanQuantity失败（可能DB列缺失）: {}", e.getMessage());
            return 0;
        }
    }

    @Override
    public long sumTotalScanQuantity() {
        try {
            List<ScanRecord> scans = scanRecordService.lambdaQuery()
                    .select(ScanRecord::getQuantity)
                    .list();
            return scans.stream()
                    .mapToLong(s -> s.getQuantity() != null ? s.getQuantity() : 0L)
                    .sum();
        } catch (Exception e) {
            log.warn("sumTotalScanQuantity失败（可能DB列缺失）: {}", e.getMessage());
            return 0;
        }
    }
}
