package com.fashion.supplychain.production.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 生产数据一致性检查定时任务
 * 定期重新计算进行中订单的进度，确保数据一致性
 */
@Slf4j
@Component
public class ProductionDataConsistencyJob {

    @Autowired
    private ProductionOrderService productionOrderService;

    /**
     * 每30分钟执行一次，修复生产进度数据
     * 针对状态为 'production' (生产中) 的订单
     */
    @Scheduled(cron = "0 0/30 * * * ?")
    public void recomputeActiveOrdersProgress() {
        log.info("开始执行生产进度一致性检查...");
        long start = System.currentTimeMillis();

        try {
            // 查询所有生产中的订单
            List<ProductionOrder> activeOrders = productionOrderService.list(new LambdaQueryWrapper<ProductionOrder>()
                    .eq(ProductionOrder::getStatus, "production")
                    .eq(ProductionOrder::getDeleteFlag, 0));

            if (activeOrders == null || activeOrders.isEmpty()) {
                log.info("当前无进行中的订单，跳过检查");
                return;
            }

            int count = 0;
            for (ProductionOrder order : activeOrders) {
                try {
                    productionOrderService.recomputeProgressAsync(order.getId());
                    count++;
                } catch (Exception e) {
                    log.error("订单进度重算失败: id={}, orderNo={}", order.getId(), order.getOrderNo(), e);
                }
            }

            long duration = System.currentTimeMillis() - start;
            log.info("生产进度一致性检查完成，共处理 {} 个订单，耗时 {} ms", count, duration);

        } catch (Exception e) {
            log.error("生产进度一致性检查任务异常", e);
        }
    }
}
