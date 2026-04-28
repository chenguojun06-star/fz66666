package com.fashion.supplychain.dashboard.helper;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class DashboardInventoryQueryHelper {

    private final ProductWarehousingService productWarehousingService;
    private final ProductWarehousingMapper productWarehousingMapper;
    private final CuttingTaskService cuttingTaskService;
    private final ProductOutstockService productOutstockService;
    private final DashboardCacheHelper cacheHelper;

    public DashboardInventoryQueryHelper(
            ProductWarehousingService productWarehousingService,
            ProductWarehousingMapper productWarehousingMapper,
            CuttingTaskService cuttingTaskService,
            ProductOutstockService productOutstockService,
            DashboardCacheHelper cacheHelper) {
        this.productWarehousingService = productWarehousingService;
        this.productWarehousingMapper = productWarehousingMapper;
        this.cuttingTaskService = cuttingTaskService;
        this.productOutstockService = productOutstockService;
        this.cacheHelper = cacheHelper;
    }

    public long countWarehousingBetween(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            return 0;
        }
        return productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .between(ProductWarehousing::getCreateTime, start, end)
                .count();
    }

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

    public long countTotalWarehousing() {
        return productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .count();
    }

    public long sumTotalQualifiedQuantity() {
        QueryWrapper<ProductWarehousing> qw = new QueryWrapper<ProductWarehousing>()
                .select("COALESCE(SUM(COALESCE(qualified_quantity, 0)), 0) as total")
                .eq("delete_flag", 0);
        return cacheHelper.extractLongScalar(productWarehousingMapper.selectMaps(qw), "total");
    }

    public long sumTotalUnqualifiedQuantity() {
        QueryWrapper<ProductWarehousing> qw = new QueryWrapper<ProductWarehousing>()
                .select("COALESCE(SUM(COALESCE(unqualified_quantity, 0)), 0) as total")
                .eq("delete_flag", 0);
        return cacheHelper.extractLongScalar(productWarehousingMapper.selectMaps(qw), "total");
    }

    public long countRepairIssues() {
        return productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .like(ProductWarehousing::getDefectRemark, "返修")
                .count();
    }

    public long sumQualifiedQuantityBetween(LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ProductWarehousing> qw = new QueryWrapper<ProductWarehousing>()
                .select("COALESCE(SUM(COALESCE(qualified_quantity, 0)), 0) as total")
                .eq("delete_flag", 0)
                .ge(start != null, "warehousing_end_time", start)
                .le(end != null, "warehousing_end_time", end);
        return cacheHelper.extractLongScalar(productWarehousingMapper.selectMaps(qw), "total");
    }

    public long countRepairIssuesBetween(LocalDateTime start, LocalDateTime end) {
        return productWarehousingService.lambdaQuery()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .ge(start != null, ProductWarehousing::getWarehousingEndTime, start)
                .le(end != null, ProductWarehousing::getWarehousingEndTime, end)
                .like(ProductWarehousing::getDefectRemark, "返修")
                .count();
    }

    public long sumWarehousingQuantityBetween(LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ProductWarehousing> qw = new QueryWrapper<ProductWarehousing>()
                .select("COALESCE(SUM(COALESCE(qualified_quantity, 0) + COALESCE(unqualified_quantity, 0)), 0) as total")
                .eq("delete_flag", 0)
                .ge(start != null, "warehousing_end_time", start)
                .le(end != null, "warehousing_end_time", end);
        return cacheHelper.extractLongScalar(productWarehousingMapper.selectMaps(qw), "total");
    }

    public long sumCuttingQuantityBetween(LocalDateTime start, LocalDateTime end) {
        List<CuttingTask> tasks = cuttingTaskService.lambdaQuery()
                .select(CuttingTask::getOrderQuantity)
                .eq(CuttingTask::getStatus, "bundled")
                .ge(start != null, CuttingTask::getBundledTime, start)
                .le(end != null, CuttingTask::getBundledTime, end)
                .isNotNull(CuttingTask::getBundledTime)
                .isNotNull(CuttingTask::getOrderQuantity)
                .last("LIMIT 5000")
                .list();

        long total = tasks.stream()
                .mapToInt(CuttingTask::getOrderQuantity)
                .sum();

        log.info("裁剪数量统计 - 开始时间: {}, 结束时间: {}, 已完成任务数: {}, 总数量: {}",
                start, end, tasks.size(), total);

        return total;
    }

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

    public long countOutstockBetween(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            return 0;
        }
        return productOutstockService.lambdaQuery()
                .eq(ProductOutstock::getDeleteFlag, 0)
                .between(ProductOutstock::getCreateTime, start, end)
                .count();
    }

    public long sumOutstockQuantityBetween(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            return 0;
        }
        QueryWrapper<ProductOutstock> qw = new QueryWrapper<ProductOutstock>()
                .select("COALESCE(SUM(COALESCE(outstock_quantity, 0)), 0) as total")
                .eq("delete_flag", 0)
                .between("create_time", start, end);
        return cacheHelper.extractLongScalar(productOutstockService.getBaseMapper().selectMaps(qw), "total");
    }
}
