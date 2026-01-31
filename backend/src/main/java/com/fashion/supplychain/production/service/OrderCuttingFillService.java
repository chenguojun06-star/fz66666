package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.mapper.CuttingTaskMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 订单裁剪填充服务
 * 处理裁剪菲号汇总和裁剪任务详情的填充
 */
@Service
@Slf4j
public class OrderCuttingFillService {

    private final CuttingBundleMapper cuttingBundleMapper;
    private final CuttingTaskMapper cuttingTaskMapper;

    @Autowired
    public OrderCuttingFillService(
            CuttingBundleMapper cuttingBundleMapper,
            CuttingTaskMapper cuttingTaskMapper) {
        this.cuttingBundleMapper = cuttingBundleMapper;
        this.cuttingTaskMapper = cuttingTaskMapper;
    }

    /**
     * 填充裁剪汇总数据
     * 包括：裁剪数量、菲号数量、裁剪任务详情
     */
    public void fillCuttingSummary(List<ProductionOrder> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        List<String> orderIds = records.stream()
                .map(r -> r == null ? null : r.getId())
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());

        if (orderIds.isEmpty()) {
            return;
        }

        // 1. 查询裁剪菲号汇总
        Map<String, int[]> cuttingAgg = aggregateCuttingBundles(orderIds);

        // 2. 查询裁剪任务详情
        Map<String, CuttingTask> cuttingTaskMap = queryCuttingTasks(orderIds);

        // 3. 填充数据到订单
        for (ProductionOrder o : records) {
            if (o == null) {
                continue;
            }
            String oid = o.getId();
            if (!StringUtils.hasText(oid)) {
                continue;
            }
            String oidTrimmed = oid.trim();

            // 填充菲号汇总
            int[] v = cuttingAgg.get(oidTrimmed);
            if (v == null) {
                o.setCuttingQuantity(0);
                o.setCuttingBundleCount(0);
            } else {
                o.setCuttingQuantity(Math.max(0, v[0]));
                o.setCuttingBundleCount(Math.max(0, v[1]));
            }

            // 填充裁剪任务详情
            CuttingTask task = cuttingTaskMap.get(oidTrimmed);
            o.setCuttingTask(task);
        }
    }

    /**
     * 聚合裁剪菲号数据
     * 返回：Map<orderId, [totalQuantity, bundleCount]>
     */
    private Map<String, int[]> aggregateCuttingBundles(List<String> orderIds) {
        Map<String, int[]> agg = new HashMap<>();

        List<Map<String, Object>> rows;
        try {
            QueryWrapper<CuttingBundle> qw = new QueryWrapper<CuttingBundle>()
                    .select("production_order_id as orderId", "COALESCE(SUM(quantity), 0) as totalQuantity",
                            "COUNT(1) as bundleCount")
                    .in("production_order_id", orderIds)
                    .groupBy("production_order_id");
            rows = cuttingBundleMapper.selectMaps(qw);
        } catch (Exception e) {
            log.warn("Failed to query cutting summary: orderIdsCount={}", orderIds == null ? 0 : orderIds.size(), e);
            return agg;
        }

        if (rows != null) {
            for (Map<String, Object> row : rows) {
                if (row == null || row.isEmpty()) {
                    continue;
                }
                String orderId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "orderId"));
                if (!StringUtils.hasText(orderId)) {
                    orderId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "productionOrderId"));
                }
                if (!StringUtils.hasText(orderId)) {
                    continue;
                }
                int totalQuantity = ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(row, "totalQuantity"));
                int bundleCount = ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(row, "bundleCount"));
                agg.put(orderId, new int[] { totalQuantity, bundleCount });
            }
        }

        return agg;
    }

    /**
     * 查询裁剪任务详情
     */
    private Map<String, CuttingTask> queryCuttingTasks(List<String> orderIds) {
        Map<String, CuttingTask> cuttingTaskMap = new HashMap<>();

        try {
            List<CuttingTask> tasks = cuttingTaskMapper.selectList(
                    new LambdaQueryWrapper<CuttingTask>()
                            .in(CuttingTask::getProductionOrderId, orderIds));
            if (tasks != null) {
                for (CuttingTask task : tasks) {
                    if (task != null && StringUtils.hasText(task.getProductionOrderId())) {
                        cuttingTaskMap.put(task.getProductionOrderId().trim(), task);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to query cutting tasks: orderIdsCount={}", orderIds.size(), e);
        }

        return cuttingTaskMap;
    }
}
