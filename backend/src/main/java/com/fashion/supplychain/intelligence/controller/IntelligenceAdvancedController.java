package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.orchestration.*;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 高级智能体控制器
 *
 * 暴露以下智能体API：
 * - P1级智能体（中等优先级）
 *   - 退货预测与归因智能体
 *   - 多仓库存平衡智能体
 *   - 价格弹性预测智能体
 *   - 物流在途异常监控智能体
 *   - 智能调拨优化智能体
 *   - SKU断货风险评分智能体
 *
 * - P2级智能体（低优先级）
 *   - 渠道销售分布预测智能体
 *   - 区域销量热力预测智能体
 *   - 运输成本优化智能体
 *   - 业务指标健康度诊断智能体
 *   - 外协工厂动态评分与推荐智能体
 */
@RestController
@RequestMapping("/api/intelligence/advanced")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class IntelligenceAdvancedController {

    // ==================== P1级智能体 ====================
    private final ReturnPredictionOrchestrator returnPredictionOrchestrator;
    private final MultiWarehouseBalanceOrchestrator multiWarehouseBalanceOrchestrator;
    private final PriceElasticityOrchestrator priceElasticityOrchestrator;
    private final LogisticsTrackingOrchestrator logisticsTrackingOrchestrator;
    private final InventoryTransferOrchestrator inventoryTransferOrchestrator;
    private final SkuStockoutRiskOrchestrator skuStockoutRiskOrchestrator;

    // ==================== P2级智能体 ====================
    private final ChannelSalesPredictor channelSalesPredictor;
    private final RegionalSalesPredictor regionalSalesPredictor;
    private final TransportationCostOptimizer transportationCostOptimizer;
    private final BusinessHealthDiagnostic businessHealthDiagnostic;
    private final OutsourcingFactoryRecommender outsourcingFactoryRecommender;

    // ==================== P1-1: 退货预测与归因智能体 ====================

    @GetMapping("/return-prediction/predict")
    public Result<?> predictReturnRate(@RequestParam String styleNo) {
        var response = returnPredictionOrchestrator.predictReturnRate(styleNo);
        return Result.success(response);
    }

    @PostMapping("/return-prediction/predict-batch")
    public Result<?> predictReturnRateBatch(@RequestBody Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<String> styleNos = (List<String>) request.get("styleNos");
        var responses = returnPredictionOrchestrator.predictReturnRateBatch(styleNos);
        return Result.success(responses);
    }

    @GetMapping("/return-prediction/high-risk")
    public Result<?> getHighReturnRiskItems(
            @RequestParam(defaultValue = "15") int thresholdPercent,
            @RequestParam(defaultValue = "20") int limit) {
        var response = returnPredictionOrchestrator.getHighReturnRiskItems(thresholdPercent, limit);
        return Result.success(response);
    }

    // ==================== P1-2: 多仓库存平衡智能体 ====================

    @GetMapping("/warehouse-balance/analyze")
    public Result<?> analyzeWarehouseBalance() {
        var response = multiWarehouseBalanceOrchestrator.analyzeBalance();
        return Result.success(response);
    }

    @GetMapping("/warehouse-balance/transfer-suggestion")
    public Result<?> suggestTransferForSku(
            @RequestParam String styleNo,
            @RequestParam String color,
            @RequestParam String size) {
        var response = multiWarehouseBalanceOrchestrator.suggestTransferForSku(styleNo, color, size);
        return Result.success(response);
    }

    // ==================== P1-3: 价格弹性预测智能体 ====================

    @GetMapping("/price-elasticity/analyze")
    public Result<?> analyzePriceElasticity(@RequestParam String styleNo) {
        var response = priceElasticityOrchestrator.analyzeElasticity(styleNo);
        return Result.success(response);
    }

    @PostMapping("/price-elasticity/predict-impact")
    public Result<?> predictPriceImpact(@RequestBody Map<String, Object> request) {
        String styleNo = (String) request.get("styleNo");
        double currentPrice = request.get("currentPrice") != null ?
                ((Number) request.get("currentPrice")).doubleValue() : 100;
        double newPrice = request.get("newPrice") != null ?
                ((Number) request.get("newPrice")).doubleValue() : 100;

        var response = priceElasticityOrchestrator.predictPriceImpact(styleNo, currentPrice, newPrice);
        return Result.success(response);
    }

    @PostMapping("/price-elasticity/recommendations")
    public Result<?> getPricingRecommendations(@RequestBody Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<String> styleNos = (List<String>) request.get("styleNos");
        var response = priceElasticityOrchestrator.getPricingRecommendations(styleNos);
        return Result.success(response);
    }

    // ==================== P1-4: 物流在途异常监控智能体 ====================

    @GetMapping("/logistics/monitor")
    public Result<?> monitorInTransitOrders() {
        var response = logisticsTrackingOrchestrator.monitorInTransitOrders();
        return Result.success(response);
    }

    @GetMapping("/logistics/track")
    public Result<?> trackOrder(@RequestParam String orderNo) {
        var response = logisticsTrackingOrchestrator.trackOrder(orderNo);
        return Result.success(response);
    }

    @GetMapping("/logistics/high-risk")
    public Result<?> getHighRiskOrders() {
        var response = logisticsTrackingOrchestrator.getHighRiskOrders();
        return Result.success(response);
    }

    // ==================== P1-5: 智能调拨优化智能体 ====================

    @GetMapping("/transfer-plan/generate")
    public Result<?> generateTransferPlan(@RequestParam String styleNo) {
        var response = inventoryTransferOrchestrator.generateTransferPlan(styleNo);
        return Result.success(response);
    }

    @PostMapping("/transfer-plan/batch")
    public Result<?> generateBatchTransferPlan(@RequestBody Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<String> styleNos = (List<String>) request.get("styleNos");
        var response = inventoryTransferOrchestrator.generateBatchTransferPlan(styleNos);
        return Result.success(response);
    }

    @GetMapping("/transfer-plan/demand")
    public Result<?> analyzeTransferDemand() {
        var response = inventoryTransferOrchestrator.analyzeTransferDemand();
        return Result.success(response);
    }

    // ==================== P1-6: SKU断货风险评分智能体 ====================

    @PostMapping("/stockout-risk/analyze")
    public Result<?> analyzeStockoutRisk(@RequestBody Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<String> styleNos = (List<String>) request.get("styleNos");
        var response = skuStockoutRiskOrchestrator.analyzeStockoutRisk(styleNos);
        return Result.success(response);
    }

    @GetMapping("/stockout-risk/high-risk")
    public Result<?> getHighRiskSkus(
            @RequestParam(defaultValue = "60") int riskThreshold,
            @RequestParam(defaultValue = "20") int limit) {
        var response = skuStockoutRiskOrchestrator.getHighRiskSkus(riskThreshold, limit);
        return Result.success(response);
    }

    @PostMapping("/stockout-risk/replenishment")
    public Result<?> getReplenishmentSuggestions(@RequestBody Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<String> styleNos = (List<String>) request.get("styleNos");
        var response = skuStockoutRiskOrchestrator.getReplenishmentSuggestions(styleNos);
        return Result.success(response);
    }

    // ==================== P2-1: 渠道销售分布预测智能体 ====================

    @GetMapping("/channel-sales/analyze")
    public Result<?> analyzeChannelSales(@RequestParam String styleNo) {
        var response = channelSalesPredictor.analyzeChannelSales(styleNo);
        return Result.success(response);
    }

    @PostMapping("/channel-sales/predict")
    public Result<?> predictMultiChannelSales(@RequestBody Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<String> styleNos = (List<String>) request.get("styleNos");
        var response = channelSalesPredictor.predictMultiChannelSales(styleNos);
        return Result.success(response);
    }

    @GetMapping("/channel-sales/performance")
    public Result<?> evaluateChannelPerformance() {
        var response = channelSalesPredictor.evaluateChannelPerformance();
        return Result.success(response);
    }

    // ==================== P2-2: 区域销量热力预测智能体 ====================

    @GetMapping("/regional-sales/analyze")
    public Result<?> analyzeRegionalSales() {
        var response = regionalSalesPredictor.analyzeRegionalSales();
        return Result.success(response);
    }

    @GetMapping("/regional-sales/predict")
    public Result<?> predictRegionalSales() {
        var response = regionalSalesPredictor.predictRegionalSales();
        return Result.success(response);
    }

    @GetMapping("/regional-sales/heatmap")
    public Result<?> getHeatmapData() {
        var response = regionalSalesPredictor.getHeatmapData();
        return Result.success(response);
    }

    // ==================== P2-3: 运输成本优化智能体 ====================

    @GetMapping("/transportation-cost/analyze")
    public Result<?> analyzeTransportationCosts() {
        var response = transportationCostOptimizer.analyzeTransportationCosts();
        return Result.success(response);
    }

    @GetMapping("/transportation-cost/optimal-plan")
    public Result<?> getOptimalTransportPlan(
            @RequestParam String origin,
            @RequestParam String destination,
            @RequestParam int weight) {
        var response = transportationCostOptimizer.getOptimalTransportPlan(origin, destination, weight);
        return Result.success(response);
    }

    @GetMapping("/transportation-cost/carrier-performance")
    public Result<?> evaluateCarrierPerformance() {
        var response = transportationCostOptimizer.evaluateCarrierPerformance();
        return Result.success(response);
    }

    // ==================== P2-4: 业务指标健康度诊断智能体 ====================

    @GetMapping("/business-health/diagnose")
    public Result<?> diagnoseBusinessHealth() {
        var response = businessHealthDiagnostic.diagnoseBusinessHealth();
        return Result.success(response);
    }

    @GetMapping("/business-health/kpi-report")
    public Result<?> getKpiReport() {
        var response = businessHealthDiagnostic.getKpiReport();
        return Result.success(response);
    }

    @GetMapping("/business-health/trend")
    public Result<?> getMetricTrend(@RequestParam String metricName) {
        var response = businessHealthDiagnostic.getMetricTrend(metricName);
        return Result.success(response);
    }

    // ==================== P2-5: 外协工厂动态评分与推荐智能体 ====================

    @GetMapping("/factory/performance")
    public Result<?> evaluateFactoryPerformance() {
        var response = outsourcingFactoryRecommender.evaluateFactoryPerformance();
        return Result.success(response);
    }

    @GetMapping("/factory/recommend")
    public Result<?> recommendFactories(@RequestParam(required = false) String criteria) {
        var response = outsourcingFactoryRecommender.recommendFactories(criteria);
        return Result.success(response);
    }

    @PostMapping("/factory/compare")
    public Result<?> compareFactories(@RequestBody Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<String> factoryIds = (List<String>) request.get("factoryIds");
        var response = outsourcingFactoryRecommender.compareFactories(factoryIds);
        return Result.success(response);
    }

    @GetMapping("/factory/capability-matrix")
    public Result<?> getCapabilityMatrix() {
        var response = outsourcingFactoryRecommender.getCapabilityMatrix();
        return Result.success(response);
    }
}
