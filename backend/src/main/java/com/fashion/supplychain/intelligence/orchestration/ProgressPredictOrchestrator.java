package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.PredictFinishRequest;
import com.fashion.supplychain.intelligence.dto.PredictFinishResponse;
import com.fashion.supplychain.intelligence.entity.IntelligencePredictionLog;
import com.fashion.supplychain.intelligence.entity.IntelligenceProcessStats;
import com.fashion.supplychain.intelligence.mapper.IntelligencePredictionLogMapper;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 进度预测编排器 — 基于真实扫码件数驱动的预判（与进度球同源逻辑）
 *
 * <p><b>预测算法（qty_v2）：</b>
 * <pre>
 *   totalQty         = cuttingQuantity 或 orderQuantity（与进度球分母一致）
 *   doneQty          = SUM(scan_record.quantity WHERE success AND stage匹配)
 *                      来源：v_production_order_stage_done_agg 视图
 *   remainingQty     = totalQty - doneQty
 *
 *   P1（最准）: remainingQty × stats.avgMinutesPerUnit
 *   P2（次）  : stats.avgStageTotalMinutes × (remainingQty / totalQty)
 *   P3（降级）: remainingQty × 8 min/件（服装生产经验均值）
 * </pre>
 */
@Service
@Slf4j
public class ProgressPredictOrchestrator {

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    @Autowired
    private IntelligencePredictionLogMapper predictionLogMapper;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    public PredictFinishResponse predictFinish(PredictFinishRequest request) {
        String predictionId = "PRED-" + UUID.randomUUID().toString()
                .replace("-", "").substring(0, 16).toUpperCase();

        PredictFinishResponse response = new PredictFinishResponse();
        response.setPredictionId(predictionId);

        // ── 1. 归一化参数 ──────────────────────────────────────────────────
        String orderId   = request != null ? request.getOrderId()   : null;
        String stageName = request != null ? request.getStageName() : null;
        String normalizedStage = ProcessStatsEngine.normalizeStage(stageName);

        UserContext ctx = UserContext.get();
        Long tenantId = ctx != null ? ctx.getTenantId() : null;

        // ── 2. 动态读取真实件数（与进度球 boardStats 同源）────────────────
        int totalQty = 0;
        int doneQty  = 0;

        if (StringUtils.hasText(orderId)) {
            try {
                // 2a. 总件数：cuttingQuantity 优先，fallback orderQuantity
                ProductionOrder order = productionOrderService.getDetailById(orderId);
                if (order != null) {
                    totalQty = (order.getCuttingQuantity() != null && order.getCuttingQuantity() > 0)
                            ? order.getCuttingQuantity()
                            : (order.getOrderQuantity() != null ? order.getOrderQuantity() : 0);
                }

                // 2b. 已完成件数：查 v_production_order_stage_done_agg
                if (StringUtils.hasText(stageName)) {
                    List<Map<String, Object>> aggs = scanRecordMapper.selectStageDoneAgg(
                            Collections.singletonList(orderId));
                    if (aggs != null) {
                        for (Map<String, Object> row : aggs) {
                            String rowStage = row.get("stageName") == null
                                    ? null : row.get("stageName").toString();
                            if (stageMatches(rowStage, stageName, normalizedStage)) {
                                Object doneVal = row.get("doneQuantity");
                                if (doneVal != null) {
                                    doneQty += Integer.parseInt(doneVal.toString());
                                }
                            }
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("[预测] 读取订单/扫码数据失败，降级处理: orderId={}, err={}", orderId, e.getMessage());
            }
        }

        response.setTotalQuantity(totalQty);
        response.setDoneQuantity(doneQty);
        int remainingQty = Math.max(0, totalQty - doneQty);
        response.setRemainingQuantity(remainingQty);

        // ── 3. 已全部完成则直接返回 ────────────────────────────────────────
        if (totalQty > 0 && remainingQty == 0) {
            response.setPredictedFinishTime(LocalDateTime.now());
            response.setConfidence(1.0);
            response.getReasons().add(String.format(
                    "工序「%s」已全部完成（%d/%d 件）", stageName, doneQty, totalQty));
            return response;
        }

        // ── 4. 查历史学习统计 ──────────────────────────────────────────────
        IntelligenceProcessStats stats = null;
        if (StringUtils.hasText(normalizedStage)) {
            stats = processStatsEngine.findBestStats(tenantId, normalizedStage, "production");
            if (stats == null) {
                stats = processStatsEngine.findBestStats(tenantId, normalizedStage, null);
            }
        }

        // ── 5. 计算预测分钟数 ──────────────────────────────────────────────
        LocalDateTime now = LocalDateTime.now();
        long predictedMinutes;
        double confidence;
        String algorithmNote;

        if (stats != null
                && stats.getAvgMinutesPerUnit() != null
                && stats.getAvgMinutesPerUnit().compareTo(BigDecimal.ZERO) > 0
                && remainingQty > 0) {

            // P1：剩余件数 × 每件平均分钟（最精准）
            predictedMinutes = Math.max(1,
                    Math.round(stats.getAvgMinutesPerUnit().doubleValue() * remainingQty));
            confidence = stats.getConfidenceScore() != null
                    ? stats.getConfidenceScore().doubleValue() : 0.55;
            algorithmNote = String.format(
                    "基于 %d 个历史订单：每件平均 %.1f 分钟，剩余 %d 件，预计还需 %d 分钟",
                    stats.getSampleCount(),
                    stats.getAvgMinutesPerUnit().doubleValue(),
                    remainingQty, predictedMinutes);

        } else if (stats != null
                && stats.getAvgStageTotalMinutes() != null
                && stats.getAvgStageTotalMinutes().compareTo(BigDecimal.ZERO) > 0
                && totalQty > 0) {

            // P2：总耗时 × 剩余比例（无 avgMinutesPerUnit 时降级）
            double remainFraction = (double) remainingQty / totalQty;
            predictedMinutes = Math.max(1,
                    Math.round(stats.getAvgStageTotalMinutes().doubleValue() * remainFraction));
            confidence = stats.getConfidenceScore() != null
                    ? stats.getConfidenceScore().doubleValue() * 0.85 : 0.40;
            algorithmNote = String.format(
                    "基于 %d 个历史订单：阶段平均总耗时 %.0f 分钟，剩余 %d/%d 件，预计还需 %d 分钟",
                    stats.getSampleCount(),
                    stats.getAvgStageTotalMinutes().doubleValue(),
                    remainingQty, totalQty, predictedMinutes);

        } else {
            // P3：经验规则降级（8 min/件，服装生产常见均值）
            int baseQty = remainingQty > 0 ? remainingQty
                    : (request != null && request.getCurrentProgress() != null
                            ? Math.max(1, 100 - request.getCurrentProgress()) : 50);
            predictedMinutes = Math.max(30, (long) baseQty * 8);
            confidence = 0.30;
            String stageDesc = StringUtils.hasText(stageName) ? "工序「" + stageName + "」" : "该工序";
            algorithmNote = stageDesc + " 暂无历史统计数据，按经验规则估算（剩余 "
                    + baseQty + " 件 × 8 分钟/件）";
            response.getSuggestions().add("每日学习任务运行后，预测精度将随历史数据积累持续提升");
            log.debug("[预测降级] 租户 {} 工序「{}」无统计数据", tenantId, stageName);
        }

        response.setPredictedFinishTime(now.plusMinutes(predictedMinutes));
        response.setConfidence(confidence);
        response.getReasons().add(algorithmNote);

        if (totalQty > 0) {
            int pct = (int) Math.round(doneQty * 100.0 / totalQty);
            response.getReasons().add(String.format("当前进度：%d/%d 件（%d%%）",
                    doneQty, totalQty, pct));
        }

        if (stats != null && stats.getSampleCount() != null && stats.getSampleCount() < 5) {
            response.getSuggestions().add("样本量较少（" + stats.getSampleCount()
                    + " 个订单），预测精度随数据积累将持续提升");
        }

        // ── 6. 写入预测日志（数据飞轮闭环）──────────────────────────────────
        savePredictionLog(predictionId, request, stats, response.getPredictedFinishTime(), tenantId);

        return response;
    }

    /**
     * 工序名匹配：支持直接匹配和标准化后匹配，与前端 stageNameMatches 逻辑对齐。
     */
    private boolean stageMatches(String rowStage, String requested, String normalizedRequested) {
        if (!StringUtils.hasText(rowStage) || !StringUtils.hasText(requested)) return false;
        if (rowStage.equalsIgnoreCase(requested)) return true;
        String normalizedRow = ProcessStatsEngine.normalizeStage(rowStage);
        return StringUtils.hasText(normalizedRow)
                && normalizedRow.equalsIgnoreCase(normalizedRequested);
    }

    private void savePredictionLog(String predictionId, PredictFinishRequest request,
            IntelligenceProcessStats stats, LocalDateTime predictedTime, Long tenantId) {
        try {
            IntelligencePredictionLog logEntry = new IntelligencePredictionLog();
            logEntry.setPredictionId(predictionId);
            logEntry.setTenantId(tenantId);
            logEntry.setAlgorithmVersion("qty_v2");
            logEntry.setPredictedFinishTime(predictedTime);
            logEntry.setSampleCount(stats != null ? stats.getSampleCount() : null);
            logEntry.setConfidence(stats != null ? stats.getConfidenceScore() : null);
            if (request != null) {
                logEntry.setOrderId(request.getOrderId());
                logEntry.setOrderNo(request.getOrderNo());
                logEntry.setStageName(request.getStageName());
                logEntry.setProcessName(request.getProcessName());
                logEntry.setCurrentProgress(request.getCurrentProgress());
            }
            predictionLogMapper.insert(logEntry);
        } catch (Exception e) {
            log.warn("[预测日志] 写入失败（不影响预测结果）: {}", e.getMessage());
        }
    }
}
