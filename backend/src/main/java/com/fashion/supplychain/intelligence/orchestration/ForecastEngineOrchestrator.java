package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.ForecastEngineRequest;
import com.fashion.supplychain.intelligence.dto.ForecastEngineResponse;
import com.fashion.supplychain.intelligence.entity.ForecastLog;
import com.fashion.supplychain.intelligence.mapper.ForecastLogMapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Stage5 — 预测引擎 Orchestrator
 * 支持三类预测：COST（成本）、DEMAND（需求量）、MATERIAL（物料用量）
 * 使用加权移动平均（WMA）+ LLM文字摘要
 */
@Service
@Slf4j
public class ForecastEngineOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ForecastLogMapper forecastLogMapper;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Autowired
    private AiAgentTraceOrchestrator traceOrchestrator;

    // ──────────────────────────────────────────────────────────────────
    // 公共入口
    // ──────────────────────────────────────────────────────────────────

    public ForecastEngineResponse forecast(ForecastEngineRequest req) {
        if (req == null || req.getForecastType() == null) {
            return errorResponse("forecastType 不能为空");
        }
        String commandId = null;
        long startTime = System.currentTimeMillis();
        try {
            commandId = traceOrchestrator.startRequest(
                    req.getForecastType() + ":" + req.getSubjectId(), "forecast:request");
        } catch (Exception e) {
            log.debug("[Forecast] trace startRequest 失败: {}", e.getMessage());
        }
        ForecastEngineResponse resp;
        switch (req.getForecastType().toUpperCase()) {
            case "COST":     resp = forecastCost(req); break;
            case "DEMAND":   resp = forecastDemand(req); break;
            case "MATERIAL": resp = forecastMaterial(req); break;
            default:         resp = errorResponse("未知预测类型: " + req.getForecastType()); break;
        }
        if (commandId != null) {
            try {
                traceOrchestrator.finishRequest(commandId,
                        resp.getPredictedValue() != null ? String.valueOf(resp.getPredictedValue()) : null,
                        null, System.currentTimeMillis() - startTime);
            } catch (Exception e) {
                log.debug("[Forecast] trace finishRequest 失败: {}", e.getMessage());
            }
        }
        return resp;
    }

    // ──────────────────────────────────────────────────────────────────
    // COST — 订单单位成本预测
    // ──────────────────────────────────────────────────────────────────

    private ForecastEngineResponse forecastCost(ForecastEngineRequest req) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        // 取近90天同款已完工订单（有单价数据）
        List<ProductionOrder> history = productionOrderService.list(
                new QueryWrapper<ProductionOrder>()
                        .eq("tenant_id", tenantId)
                        .eq("style_no", req.getSubjectId())
                        .eq("status", "COMPLETED")
                        .eq("delete_flag", 0)
                        .isNotNull("factory_unit_price")
                        .gt("create_time", LocalDateTime.now().minusDays(90))
                        .orderByDesc("create_time")
                        .last("LIMIT 20")
        );

        if (history.isEmpty()) {
            return errorResponse("近90天无同款已完工订单，无法预测成本");
        }

        // WMA：越近期权重越高
        BigDecimal predictedUnitCost = wmaUnitPrice(history);
        int sampleSize = history.size();
        int confidence = sampleSize >= 10 ? 82 : (sampleSize >= 5 ? 68 : 50);
        String horizonLabel = req.getHorizon() != null ? req.getHorizon() : "本单";

        // LLM 摘要
        String rationale = generateRationale("COST",
                "款式=" + req.getSubjectId() + " 历史样本=" + sampleSize + "条，WMA单价=" + predictedUnitCost,
                "请用1-2句话解释本次成本预测的主要影响因素和注意事项");

        // 持久化预测日志
        persistLog(tenantId, "COST", req.getSubjectId(), predictedUnitCost, confidence, horizonLabel, "WMA");

        ForecastEngineResponse resp = new ForecastEngineResponse();
        resp.setForecastType("COST");
        resp.setSubjectId(req.getSubjectId());
        resp.setHorizonLabel(horizonLabel);
        resp.setPredictedValue(predictedUnitCost);
        resp.setOptimisticLow(predictedUnitCost.multiply(BigDecimal.valueOf(0.92)).setScale(2, RoundingMode.HALF_UP));
        resp.setPessimisticHigh(predictedUnitCost.multiply(BigDecimal.valueOf(1.12)).setScale(2, RoundingMode.HALF_UP));
        resp.setConfidence(confidence);
        resp.setAlgorithm("WMA-" + sampleSize + "单");
        resp.setRationale(rationale);
        resp.setBreakdown(buildCostBreakdown(predictedUnitCost));
        return resp;
    }

    // ──────────────────────────────────────────────────────────────────
    // DEMAND — 下月需求量预测（全租户级）
    // ──────────────────────────────────────────────────────────────────

    private ForecastEngineResponse forecastDemand(ForecastEngineRequest req) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 取近6个月每月订单量（按创建时间聚合）
        List<ProductionOrder> recent = productionOrderService.list(
                new QueryWrapper<ProductionOrder>()
                        .eq("tenant_id", tenantId)
                        .eq("delete_flag", 0)
                        .gt("create_time", LocalDateTime.now().minusDays(180))
                        .orderByAsc("create_time")
        );

        if (recent.isEmpty()) {
            return errorResponse("近6个月无历史订单，无法预测需求");
        }

        // 按月统计件数
        int[] monthlyQty = new int[6];
        for (ProductionOrder o : recent) {
            if (o.getCreateTime() == null) continue;
            int monthsAgo = (int) java.time.temporal.ChronoUnit.MONTHS.between(
                    o.getCreateTime().toLocalDate().withDayOfMonth(1),
                    java.time.LocalDate.now().withDayOfMonth(1));
            if (monthsAgo >= 0 && monthsAgo < 6) {
                monthlyQty[5 - monthsAgo] += (o.getOrderQuantity() != null ? o.getOrderQuantity() : 0);
            }
        }

        // WMA（最近3个月权重5:3:2）
        BigDecimal predicted = BigDecimal.valueOf(
                monthlyQty[5] * 5 + monthlyQty[4] * 3 + monthlyQty[3] * 2
        ).divide(BigDecimal.TEN, 0, RoundingMode.HALF_UP);

        int confidence = 62;
        String horizonLabel = "下月";

        String rationale = generateRationale("DEMAND",
                "近6月月均订单: " + java.util.Arrays.toString(monthlyQty) + " 件",
                "请预测下月大概需求并说明季节性规律");

        persistLog(tenantId, "DEMAND", "全租户", predicted, confidence, horizonLabel, "WMA-6M");

        ForecastEngineResponse resp = new ForecastEngineResponse();
        resp.setForecastType("DEMAND");
        resp.setSubjectId(req.getSubjectId() != null ? req.getSubjectId() : "全租户");
        resp.setHorizonLabel(horizonLabel);
        resp.setPredictedValue(predicted);
        resp.setOptimisticLow(predicted.multiply(BigDecimal.valueOf(0.80)).setScale(0, RoundingMode.HALF_UP));
        resp.setPessimisticHigh(predicted.multiply(BigDecimal.valueOf(1.25)).setScale(0, RoundingMode.HALF_UP));
        resp.setConfidence(confidence);
        resp.setAlgorithm("WMA-6M");
        resp.setRationale(rationale);
        return resp;
    }

    // ──────────────────────────────────────────────────────────────────
    // MATERIAL — 物料实际用量预测（含损耗）
    // ──────────────────────────────────────────────────────────────────

    private ForecastEngineResponse forecastMaterial(ForecastEngineRequest req) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 取该款式近5单已完工的裁剪数 vs 订单数
        List<ProductionOrder> history = productionOrderService.list(
                new QueryWrapper<ProductionOrder>()
                        .eq("tenant_id", tenantId)
                        .eq("style_no", req.getSubjectId())
                        .eq("status", "COMPLETED")
                        .eq("delete_flag", 0)
                        .isNotNull("cutting_quantity")
                        .isNotNull("order_quantity")
                        .gt("create_time", LocalDateTime.now().minusDays(180))
                        .orderByDesc("create_time")
                        .last("LIMIT 5")
        );

        if (history.isEmpty()) {
            return errorResponse("近180天无同款完工历史，无法预测物料用量");
        }

        // 平均耗损率（裁剪用料/订单数量 - 1）
        double totalWasteRatio = 0.0;
        int validCount = 0;
        for (ProductionOrder o : history) {
            if (o.getOrderQuantity() != null && o.getOrderQuantity() > 0
                    && o.getCuttingQuantity() != null) {
                totalWasteRatio += (double) o.getCuttingQuantity() / o.getOrderQuantity() - 1.0;
                validCount++;
            }
        }
        double avgWasteRatio = validCount > 0 ? totalWasteRatio / validCount : 0;
        BigDecimal wasteCoeff = BigDecimal.valueOf(1 + avgWasteRatio).setScale(4, RoundingMode.HALF_UP);

        // 预计物料用量 = 目标件数 × 耗损系数 × 平均单件用料 1.0（需根据BOM调整）
        BigDecimal predictedMaterial = wasteCoeff; // 以系数形式返回

        int confidence = history.size() >= 3 ? 74 : 55;
        String horizonLabel = "本单";

        String avgWastePercent = BigDecimal.valueOf(avgWasteRatio * 100).setScale(1, RoundingMode.HALF_UP) + "%";
        String rationale = generateRationale("MATERIAL",
                "款式=" + req.getSubjectId() + " 近" + history.size() + "单平均损耗率=" + avgWastePercent,
                "请解释该损耗率是否正常，并给出降低物料损耗的建议");

        persistLog(tenantId, "MATERIAL", req.getSubjectId(), predictedMaterial, confidence, horizonLabel, "历史损耗率均值");

        ForecastEngineResponse resp = new ForecastEngineResponse();
        resp.setForecastType("MATERIAL");
        resp.setSubjectId(req.getSubjectId());
        resp.setHorizonLabel(horizonLabel);
        resp.setPredictedValue(predictedMaterial);
        resp.setOptimisticLow(BigDecimal.valueOf(1.0));
        resp.setPessimisticHigh(predictedMaterial.multiply(BigDecimal.valueOf(1.05)).setScale(4, RoundingMode.HALF_UP));
        resp.setConfidence(confidence);
        resp.setAlgorithm("历史损耗率均值-" + history.size() + "单");
        resp.setRationale(rationale);
        resp.setHistoricalBiasNote("平均损耗率：" + avgWastePercent);
        return resp;
    }

    // ──────────────────────────────────────────────────────────────────
    // 私有工具方法
    // ──────────────────────────────────────────────────────────────────

    /** 加权移动平均：最近权重高 (系数 n, n-1, n-2 ... 1) */
    private BigDecimal wmaUnitPrice(List<ProductionOrder> orders) {
        BigDecimal weightedSum = BigDecimal.ZERO;
        BigDecimal weightTotal = BigDecimal.ZERO;
        int n = orders.size();
        for (int i = 0; i < n; i++) {
            BigDecimal price = orders.get(i).getFactoryUnitPrice();
            if (price == null) continue;
            BigDecimal w = BigDecimal.valueOf(n - i); // 最新权重最大
            weightedSum = weightedSum.add(price.multiply(w));
            weightTotal = weightTotal.add(w);
        }
        if (weightTotal.compareTo(BigDecimal.ZERO) == 0) return BigDecimal.ZERO;
        return weightedSum.divide(weightTotal, 2, RoundingMode.HALF_UP);
    }

    private List<ForecastEngineResponse.BreakdownItem> buildCostBreakdown(BigDecimal unitCost) {
        List<ForecastEngineResponse.BreakdownItem> list = new ArrayList<>();
        // 粗略拆分：物料60%，工序30%，损耗10%
        addBreak(list, "物料成本", unitCost.multiply(BigDecimal.valueOf(0.60)).setScale(2, RoundingMode.HALF_UP), "元/件");
        addBreak(list, "工序费用", unitCost.multiply(BigDecimal.valueOf(0.30)).setScale(2, RoundingMode.HALF_UP), "元/件");
        addBreak(list, "损耗/管理", unitCost.multiply(BigDecimal.valueOf(0.10)).setScale(2, RoundingMode.HALF_UP), "元/件");
        return list;
    }

    private void addBreak(List<ForecastEngineResponse.BreakdownItem> list, String label, BigDecimal val, String unit) {
        ForecastEngineResponse.BreakdownItem item = new ForecastEngineResponse.BreakdownItem();
        item.setLabel(label); item.setValue(val); item.setUnit(unit);
        list.add(item);
    }

    private String generateRationale(String type, String dataDesc, String question) {
        try {
            String systemPrompt = "你是服装供应链AI预测分析师，用简洁中文回答，不超过80字。";
            String userMsg = "[预测类型:" + type + "] [数据摘要: " + dataDesc + "] 问题: " + question;
            var result = inferenceOrchestrator.chat("forecast-ration-" + type.toLowerCase(), systemPrompt, userMsg);
            return result.isSuccess() ? result.getContent() : "AI摘要生成中...";
        } catch (Exception e) {
            log.warn("[ForecastEngine] rationale LLM failed: {}", e.getMessage());
            return "基于历史数据加权移动平均预测。";
        }
    }

    private void persistLog(Long tenantId, String type, String subjectId,
                            BigDecimal predicted, int confidence, String horizon, String algorithm) {
        try {
            ForecastLog log2 = new ForecastLog();
            log2.setTenantId(tenantId);
            log2.setForecastType(type);
            log2.setSubjectId(subjectId);
            log2.setPredictedValue(predicted);
            log2.setConfidence(confidence);
            log2.setHorizonLabel(horizon);
            log2.setAlgorithm(algorithm);
            log2.setCreateTime(LocalDateTime.now());
            forecastLogMapper.insert(log2);
        } catch (Exception ex) {
            log.warn("[ForecastEngine] persist log failed: {}", ex.getMessage());
        }
    }

    private ForecastEngineResponse errorResponse(String msg) {
        ForecastEngineResponse r = new ForecastEngineResponse();
        r.setRationale(msg);
        r.setConfidence(0);
        return r;
    }
}
