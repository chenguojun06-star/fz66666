package com.fashion.supplychain.intelligence.job;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.service.ExternalDataService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;

/**
 * 供应链风险监控定时任务
 *
 * <p>P2升级：定期评估供应链风险，主动推送预警</p>
 *
 * <p>执行频率：每天早上 7:00</p>
 *
 * @author xiaoyun
 * @since 2026-06-24
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SupplyChainRiskMonitorJob {

    private final ExternalDataService externalDataService;
    private final ProductionOrderService productionOrderService;

    /**
     * 每日供应链风险评估
     *
     * <p>执行内容：</p>
     * <ol>
     *   <li>获取面料价格波动</li>
     *   <li>获取汇率变化</li>
     *   <li>评估供应商所在地天气风险</li>
     *   <li>检查在途物料交期风险</li>
     *   <li>生成智能建议并推送</li>
     * </ol>
     */
    @Scheduled(cron = "0 0 7 * * ?")  // 每天早上 7:00
    public void monitorSupplyChainRisk() {
        log.info("[SupplyChainRiskMonitor] 开始每日供应链风险评估...");

        try {
            // 1. 面料价格风险
            assessFabricPriceRisk();

            // 2. 汇率风险
            assessExchangeRateRisk();

            // 3. 天气风险（针对主要供应商所在地）
            assessWeatherRisk();

            // 4. 在途物料交期风险
            assessMaterialDeliveryRisk();

            log.info("[SupplyChainRiskMonitor] 每日供应链风险评估完成");
        } catch (Exception e) {
            log.error("[SupplyChainRiskMonitor] 风险评估异常: {}", e.getMessage(), e);
        }
    }

    /**
     * 评估面料价格风险
     */
    private void assessFabricPriceRisk() {
        String[] fabricTypes = {"棉布", "丝绸", "化纤", "羊毛"};
        for (String fabricType : fabricTypes) {
            var priceData = externalDataService.getFabricPrice(fabricType);

            // 价格波动超过10%则预警
            if (Math.abs(priceData.getPriceIndex() - 100) > 10) {
                String advice = String.format(
                        "⚠️ %s价格波动超过10%%，当前指数%.1f（基准100）。%s趋势，建议关注采购时机。",
                        fabricType,
                        priceData.getPriceIndex(),
                        priceData.getTrend().equals("UP") ? "上涨" : "下跌"
                );
                logRiskAdvice("FABRIC_PRICE", fabricType, advice);
                log.warn("[SupplyChainRiskMonitor] 面料价格预警: {}", advice);
            }
        }
    }

    /**
     * 评估汇率风险
     */
    private void assessExchangeRateRisk() {
        var rateData = externalDataService.getExchangeRate("USD/CNY");

        // 汇率波动超过0.5则预警
        if (Math.abs(rateData.getRate() - 7.2) > 0.5) {
            String advice = String.format(
                    "⚠️ 美元/人民币汇率波动，当前汇率%.4f（偏离基准7.2超过0.5）。%s趋势，进口面料成本将受影响。",
                    rateData.getRate(),
                    rateData.getTrend().equals("UP") ? "升值" : "贬值"
            );
            logRiskAdvice("EXCHANGE_RATE", "USD/CNY", advice);
            log.warn("[SupplyChainRiskMonitor] 汇率预警: {}", advice);
        }
    }

    /**
     * 评估天气风险
     */
    private void assessWeatherRisk() {
        String[] locations = {"广州", "苏州", "绍兴", "宁波"};
        for (String location : locations) {
            var weatherData = externalDataService.getWeatherForecast(location, 3);

            // 降雨风险高则预警
            if ("HIGH".equals(weatherData.getRainfallRisk())) {
                String advice = String.format(
                        "⚠️ %s未来3天降雨风险高（%s），可能影响面料配送。建议与供应商确认交期。",
                        location,
                        weatherData.getWeather()
                );
                logRiskAdvice("WEATHER_RISK", location, advice);
                log.warn("[SupplyChainRiskMonitor] 天气预警: {}", advice);
            }
        }
    }

    /**
     * 评估在途物料交期风险
     */
    private void assessMaterialDeliveryRisk() {
        // 检查7天内即将到期的在产订单
        LocalDate now = LocalDate.now();
        LocalDate deadline = now.plusDays(7);

        QueryWrapper<ProductionOrder> qw = new QueryWrapper<ProductionOrder>()
                .ge("planned_end_date", now)
                .le("planned_end_date", deadline)
                .eq("delete_flag", 0);

        List<ProductionOrder> orders = productionOrderService.list(qw);

        if (!orders.isEmpty()) {
            // 评估这些订单的物料风险
            for (ProductionOrder order : orders) {
                var riskAssessment = externalDataService.assessSupplyRisk(
                        order.getFactoryName() != null ? order.getFactoryName() : "广州",
                        order.getStyleName() != null ? order.getStyleName() : "通用"
                );

                // HIGH 风险则预警
                if ("HIGH".equals(riskAssessment.getRiskLevel())) {
                    String advice = String.format(
                            "⚠️ 订单 %s 供应商风险评估为 HIGH（%.1f分），风险因素：%s。%s",
                            order.getOrderNo(),
                            riskAssessment.getTotalRiskScore(),
                            riskAssessment.getRecommendations(),
                            "建议提前与供应商确认交期或准备备选方案。"
                    );
                    logRiskAdvice("SUPPLIER_RISK", order.getOrderNo(), advice);
                    log.warn("[SupplyChainRiskMonitor] 供应商风险预警: {}", advice);
                }
            }
        }
    }

    /**
     * 记录风险预警日志（实际项目中可推送到消息队列或数据库）
     */
    private void logRiskAdvice(String category, String target, String content) {
        // ══════════════════════════════════════════════════════════════════════════
        // 【待集成】真实推送通道
        // 方案1：推送到 SmartAdvice 表（需先确认 SmartAdviceMapper 存在）
        //   smartAdviceMapper.insert(advice);
        // 方案2：推送到微信/飞书群（企业微信机器人）
        //   POST https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key={key}
        // 方案3：推送到 App 消息中心
        //   notificationService.push(userId, title, content)
        // ══════════════════════════════════════════════════════════════════════════

        log.warn("[SupplyChainRiskMonitor] 风险预警 | category={} | target={} | content={}",
                category, target, content);
    }
}
