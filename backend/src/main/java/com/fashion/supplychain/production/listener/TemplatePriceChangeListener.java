package com.fashion.supplychain.production.listener;

import com.fashion.supplychain.production.controller.InternalMaintenanceController;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.orchestration.StyleQuotationOrchestrator;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.template.event.TemplatePriceChangedEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationListener;
import org.springframework.lang.NonNull;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 模板价格变更监听器
 * 当工序模板价格变更时，自动同步相关订单和工序跟踪表的单价
 */
@Slf4j
@Component
public class TemplatePriceChangeListener implements ApplicationListener<TemplatePriceChangedEvent> {

    @Autowired
    private InternalMaintenanceController maintenanceController;

    @Autowired
    private StyleQuotationOrchestrator styleQuotationOrchestrator;

    @Autowired
    private StyleInfoService styleInfoService;

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

            // Step 3: 同步报价单 + StyleInfo.price（向下兼容）
            // 从单价维护(模板)向下同步到：报价单 → StyleInfo.price → 结算单价
            log.warn("[自动同步] Step 3: 开始同步报价单和款式单价");
            startTime = System.currentTimeMillis();
            int quotationSynced = 0;

            if (StringUtils.hasText(styleNo)) {
                // 有明确款号：只同步该款号
                quotationSynced = syncQuotationByStyleNo(styleNo);
            } else {
                // 无明确款号（批量模板更新）：同步所有关联款号的报价单
                // 暂不做全量同步，避免性能问题
                log.info("[自动同步] Step 3: 无明确款号，跳过报价单同步");
            }

            long quotationDuration = System.currentTimeMillis() - startTime;
            log.warn("[自动同步] Step 3 完成 - 耗时: {}ms, 同步报价单数: {}", quotationDuration, quotationSynced);

            // 汇总日志
            log.warn("[自动同步] 价格同步完成 - styleNo: {}, workflow: {}, tracking: {}, quotation: {}",
                    styleNo,
                    workflowResult.getData(),
                    trackingResult.getData(),
                    quotationSynced);

        } catch (Exception e) {
            log.error("[自动同步] 价格同步失败 - styleNo: {}, templateType: {}", styleNo, templateType, e);
        }
    }

    /**
     * 根据款号同步报价单：重算 BOM + 工序 + 二次工艺成本，更新报价单和 StyleInfo.price
     * 数据流向：单价维护(模板) → 报价单(quotation) → StyleInfo.price → 结算/进度单价
     */
    private int syncQuotationByStyleNo(String styleNo) {
        if (!StringUtils.hasText(styleNo)) return 0;

        try {
            // 通过款号找到对应的 styleId
            StyleInfo styleInfo = styleInfoService.lambdaQuery()
                    .eq(StyleInfo::getStyleNo, styleNo.trim())
                    .last("LIMIT 1")
                    .one();

            if (styleInfo == null || styleInfo.getId() == null) {
                log.info("[自动同步] 未找到款号对应的款式信息: styleNo={}", styleNo);
                return 0;
            }

            // 调用报价编排器重算（BOM + 工序 + 二次工艺 → 报价单 → StyleInfo.price）
            styleQuotationOrchestrator.recalculateFromLiveData(styleInfo.getId());
            log.info("[自动同步] 报价单同步完成: styleNo={}, styleId={}", styleNo, styleInfo.getId());
            return 1;
        } catch (Exception e) {
            log.warn("[自动同步] 报价单同步失败: styleNo={}", styleNo, e);
            return 0;
        }
    }
}
