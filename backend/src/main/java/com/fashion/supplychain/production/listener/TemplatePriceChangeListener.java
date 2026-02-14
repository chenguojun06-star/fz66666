package com.fashion.supplychain.production.listener;

import com.fashion.supplychain.production.controller.InternalMaintenanceController;
import com.fashion.supplychain.template.event.TemplatePriceChangedEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationListener;
import org.springframework.lang.NonNull;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * 模板价格变更监听器
 * 当工序模板价格变更时，自动同步相关订单和工序跟踪表的单价
 */
@Slf4j
@Component
public class TemplatePriceChangeListener implements ApplicationListener<TemplatePriceChangedEvent> {

    @Autowired
    private InternalMaintenanceController maintenanceController;

    /**
     * 配置开关：是否启用自动同步
     * application.yml 中配置：fashion.template.auto-sync-price-enabled=true
     */
    @Value("${fashion.template.auto-sync-price-enabled:true}")
    private boolean autoSyncEnabled;

    /**
     * 配置：异步同步的最大等待时间（秒）
     */
    @Value("${fashion.template.auto-sync-timeout:30}")
    private int autoSyncTimeout;

    /**
     * 异步处理事件，避免阻塞主线程
     */
    @Override
    @Async
    public void onApplicationEvent(@NonNull TemplatePriceChangedEvent event) {
        // 检查开关
        if (!autoSyncEnabled) {
            log.info("[自动同步] 价格自动同步已禁用（配置 fashion.template.auto-sync-price-enabled=false）");
            return;
        }

        String styleNo = event.getStyleNo();
        String templateType = event.getTemplateType();
        String operator = event.getOperator();

        log.warn("[自动同步] 检测到模板价格变更 - styleNo: {}, templateType: {}, operator: {}",
                styleNo, templateType, operator);

        // 只处理工序模板的价格变更
        if (!"process".equalsIgnoreCase(templateType)) {
            log.info("[自动同步] 模板类型不是 process，跳过同步 - templateType: {}", templateType);
            return;
        }

        try {
            // Step 1: 同步订单的 progressWorkflowJson
            log.warn("[自动同步] Step 1: 开始同步订单工序单价（progressWorkflowJson）");
            long startTime = System.currentTimeMillis();

            var workflowResult = maintenanceController.refreshWorkflowPrices();

            long workflowDuration = System.currentTimeMillis() - startTime;
            log.warn("[自动同步] Step 1 完成 - 耗时: {}ms, 结果: {}", workflowDuration, workflowResult.getData());

            // Step 2: 同步工序跟踪表的 unit_price
            log.warn("[自动同步] Step 2: 开始同步工序跟踪表单价（t_production_process_tracking）");
            startTime = System.currentTimeMillis();

            var trackingResult = maintenanceController.refreshTrackingPrices();

            long trackingDuration = System.currentTimeMillis() - startTime;
            log.warn("[自动同步] Step 2 完成 - 耗时: {}ms, 结果: {}", trackingDuration, trackingResult.getData());

            // 汇总日志
            log.warn("[自动同步] 价格同步完成 - styleNo: {}, workflow: {}, tracking: {}",
                    styleNo,
                    workflowResult.getData(),
                    trackingResult.getData());

        } catch (Exception e) {
            log.error("[自动同步] 价格同步失败 - styleNo: {}, templateType: {}", styleNo, templateType, e);
        }
    }
}
