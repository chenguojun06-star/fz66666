package com.fashion.supplychain.production.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.common.lock.DistributedLockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 生产数据一致性检查定时任务
 * 定期重新计算进行中订单的进度，确保数据一致性
 */
@Slf4j
@Component
public class ProductionDataConsistencyJob {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    @Autowired(required = false)
    private DistributedLockService distributedLockService;

    /**
     * 每30分钟执行一次，修复生产进度数据
     * 按租户隔离迭代，防止跨租户写入
     */
    // 错开到 :15 和 :45，避免与智能任务同时触发 DB 连接风暴
    @Scheduled(cron = "0 15/30 * * * ?")
    public void recomputeActiveOrdersProgress() {
        if (distributedLockService != null) {
            String lockValue = distributedLockService.tryLock("job:consistency", 25, TimeUnit.MINUTES);
            if (lockValue == null) {
                log.info("[ConsistencyJob] 其他实例正在执行，跳过");
                return;
            }
            try {
                doRecompute();
            } finally {
                distributedLockService.unlock("job:consistency", lockValue);
            }
        } else {
            doRecompute();
        }
    }

    private void doRecompute() {
        log.info("[ConsistencyJob] 开始执行生产进度一致性检查...");
        long start = System.currentTimeMillis();

        List<Long> tenantIds;
        try {
            tenantIds = processStatsEngine.findActiveTenantIds();
        } catch (Exception e) {
            log.error("[ConsistencyJob] 获取活跃租户列表失败，任务中止", e);
            return;
        }

        int totalSuccess = 0, totalFailed = 0;
        for (Long tenantId : tenantIds) {
            TenantAssert.bindTenantForTask(tenantId, "进度一致性检查");
            try {
                List<ProductionOrder> activeOrders = productionOrderService.list(
                        new LambdaQueryWrapper<ProductionOrder>()
                                .eq(ProductionOrder::getStatus, "production")
                                .eq(ProductionOrder::getDeleteFlag, 0));

                if (activeOrders == null || activeOrders.isEmpty()) {
                    continue;
                }

                for (ProductionOrder order : activeOrders) {
                    try {
                        productionOrderService.recomputeProgressAsync(order.getId());
                        totalSuccess++;
                    } catch (Exception e) {
                        totalFailed++;
                        log.error("[ConsistencyJob] 订单进度重算失败: tenantId={}, id={}, orderNo={}",
                                tenantId, order.getId(), order.getOrderNo(), e);
                    }
                }
            } catch (Exception e) {
                log.error("[ConsistencyJob] 租户 {} 进度检查异常", tenantId, e);
            } finally {
                TenantAssert.clearTenantContext();
            }
        }

        long duration = System.currentTimeMillis() - start;
        if (totalFailed > 0) {
            log.warn("[ConsistencyJob] 检查完成（有失败项）: 成功={}, 失败={}, 租户数={}, 耗时{}ms",
                    totalSuccess, totalFailed, tenantIds.size(), duration);
        } else {
            log.info("[ConsistencyJob] 检查完成: 成功={}, 租户数={}, 耗时{}ms",
                    totalSuccess, tenantIds.size(), duration);
        }
    }
}
