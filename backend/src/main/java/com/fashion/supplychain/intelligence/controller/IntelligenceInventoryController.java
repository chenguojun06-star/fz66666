package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.orchestration.*;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 库存智能体控制器
 *
 * 暴露以下P0智能体API：
 * - 断码预测智能体
 * - 过季库存处理智能体
 * - 促销选品与效果预测智能体
 * - 仓到店补货智能体
 */
@RestController
@RequestMapping("/api/intelligence/inventory")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class IntelligenceInventoryController {

    private final SizeBreakPredictionOrchestrator sizeBreakPredictionOrchestrator;
    private final OverstockClearanceOrchestrator overstockClearanceOrchestrator;
    private final PromotionSelectionOrchestrator promotionSelectionOrchestrator;
    private final StoreReplenishmentOrchestrator storeReplenishmentOrchestrator;

    // ==================== 断码预测智能体 ====================

    /**
     * 预测指定款号的断码风险
     *
     * @param styleNo 款号
     * @param salesChannel 销售渠道（可选）
     */
    @GetMapping("/size-break/predict")
    public Result<?> predictSizeBreak(
            @RequestParam String styleNo,
            @RequestParam(required = false) String salesChannel) {
        var response = sizeBreakPredictionOrchestrator.predictSizeBreak(styleNo, salesChannel);
        return Result.success(response);
    }

    /**
     * 批量预测多个款号的断码风险
     */
    @PostMapping("/size-break/predict-batch")
    public Result<?> predictSizeBreakBatch(@RequestBody Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<String> styleNos = (List<String>) request.get("styleNos");
        String salesChannel = (String) request.get("salesChannel");
        var responses = sizeBreakPredictionOrchestrator.predictSizeBreakBatch(styleNos, salesChannel);
        return Result.success(responses);
    }

    // ==================== 过季库存处理智能体 ====================

    /**
     * 分析过季库存并生成处理建议
     *
     * @param thresholdDays 库存天数阈值（超过此天数视为过季，默认90天）
     */
    @GetMapping("/overstock/analyze")
    public Result<?> analyzeOverstock(
            @RequestParam(defaultValue = "90") int thresholdDays) {
        var response = overstockClearanceOrchestrator.analyzeOverstock(thresholdDays);
        return Result.success(response);
    }

    /**
     * 针对特定款号生成清仓建议
     *
     * @param styleNo 款号
     * @param targetChannel 目标渠道（可选）
     */
    @GetMapping("/overstock/recommend")
    public Result<?> recommendClearance(
            @RequestParam String styleNo,
            @RequestParam(required = false) String targetChannel) {
        var response = overstockClearanceOrchestrator.recommendClearance(styleNo, targetChannel);
        return Result.success(response);
    }

    // ==================== 促销选品与效果预测智能体 ====================

    /**
     * 推荐促销选品
     *
     * @param promotionType 促销类型（DISCOUNT满减/COUPON优惠券/BUNDLE捆绑/GIVEAWAY赠品）
     * @param targetDate 促销目标日期
     */
    @GetMapping("/promotion/select")
    public Result<?> selectPromotion(
            @RequestParam(defaultValue = "DISCOUNT") String promotionType,
            @RequestParam(required = false) LocalDate targetDate) {
        LocalDate effectiveDate = targetDate != null ? targetDate : LocalDate.now().plusDays(30);
        var response = promotionSelectionOrchestrator.recommendPromotionSelection(promotionType, effectiveDate);
        return Result.success(response);
    }

    /**
     * 预测特定促销策略的效果
     */
    @PostMapping("/promotion/effect")
    public Result<?> predictEffect(@RequestBody Map<String, Object> request) {
        String styleNo = (String) request.get("styleNo");
        String promotionType = (String) request.getOrDefault("promotionType", "DISCOUNT");
        Integer discountPercent = request.get("discountPercent") != null ?
                ((Number) request.get("discountPercent")).intValue() : 20;
        LocalDate startDate = request.get("startDate") != null ?
                LocalDate.parse((String) request.get("startDate")) : LocalDate.now();
        Integer durationDays = request.get("durationDays") != null ?
                ((Number) request.get("durationDays")).intValue() : 7;

        var response = promotionSelectionOrchestrator.predictEffect(
                styleNo, promotionType, discountPercent, startDate, durationDays);
        return Result.success(response);
    }

    // ==================== 仓到店补货智能体 ====================

    /**
     * 生成仓库补货建议
     *
     * @param warehouseId 仓库ID（可选，为null时生成所有仓库建议）
     * @param leadTimeDays 补货提前期（天，默认7天）
     * @param targetStockDays 目标库存天数（默认30天）
     */
    @GetMapping("/replenishment/generate")
    public Result<?> generateReplenishment(
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(defaultValue = "7") int leadTimeDays,
            @RequestParam(defaultValue = "30") int targetStockDays) {
        var response = storeReplenishmentOrchestrator.generateReplenishment(
                warehouseId, leadTimeDays, targetStockDays);
        return Result.success(response);
    }
}
