package com.fashion.supplychain.production.service;

import com.fashion.supplychain.production.entity.ProductionOrder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.*;

/**
 * 订单工序查询服务
 * 处理当前工序名称的计算与判断
 */
@Service
@Slf4j
public class OrderProcessQueryService {

    /**
     * 填充当前工序名称
     */
    public void fillCurrentProcessName(List<ProductionOrder> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        for (ProductionOrder order : records) {
            if (!StringUtils.hasText(order.getId())) {
                continue;
            }

            try {
                String currentProcess = calculateCurrentProcess(order);
                if (StringUtils.hasText(currentProcess)) {
                    order.setCurrentProcessName(currentProcess);
                }
            } catch (Exception e) {
                log.warn("填充当前工序名称失败: orderId={}", order.getId(), e);
            }
        }
    }

    /**
     * 根据完成数量修正生产进度百分比
     */
    public void fixProductionProgressByCompletedQuantity(List<ProductionOrder> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        for (ProductionOrder order : records) {
            if (order.getOrderQuantity() == null || order.getOrderQuantity() <= 0) {
                continue;
            }

            try {
                Integer completedQty = order.getCompletedQuantity();
                if (completedQty == null) {
                    completedQty = 0;
                }

                int totalQty = order.getOrderQuantity();
                int progress = (int) Math.round((double) completedQty / totalQty * 100);
                order.setProductionProgress(Math.min(progress, 100));
            } catch (Exception e) {
                log.warn("修正生产进度失败: orderId={}", order.getId(), e);
            }
        }
    }

    /**
     * 计算当前工序
     */
    private String calculateCurrentProcess(ProductionOrder order) {
        // 简化实现：根据订单状态判断当前工序
        String status = order.getStatus();
        if (!StringUtils.hasText(status)) {
            return "待开始";
        }

        return switch (status.toLowerCase()) {
            case "not_started" -> "待开始";
            case "procurement" -> "物料采购";
            case "cutting" -> "裁剪";
            case "sewing" -> "车缝";
            case "ironing" -> "大烫";
            case "secondary_process" -> "二次工艺";
            case "packaging" -> "包装";
            case "quality_check" -> "质检";
            case "warehousing" -> "入库";
            case "completed" -> "已完成";
            default -> "进行中";
        };
    }

    /**
     * 按工序名称汇总已完成数量
     */
    private long sumDoneByStageName(Map<String, Long> doneByProcess, String stageName) {
        if (doneByProcess == null || !StringUtils.hasText(stageName)) {
            return 0L;
        }

        return doneByProcess.entrySet().stream()
                .filter(e -> e.getKey() != null && e.getKey().contains(stageName))
                .mapToLong(Map.Entry::getValue)
                .sum();
    }

    /**
     * 判断是否为基础阶段名称
     */
    private boolean isBaseStageName(String processName) {
        if (!StringUtils.hasText(processName)) {
            return false;
        }
        String lower = processName.toLowerCase();
        return lower.contains("订单") || lower.contains("采购") || lower.contains("创建");
    }
}
