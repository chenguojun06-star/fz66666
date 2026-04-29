package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiCostTracking;
import com.fashion.supplychain.intelligence.mapper.AiCostTrackingMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class AiCostTrackingOrchestrator {

    private static final Map<String, BigDecimal> MODEL_PRICING = Map.of(
            "deepseek-chat", new BigDecimal("0.00014"),
            "doubao-1-5-vision-pro-32k-250115", new BigDecimal("0.00050"),
            "qwen-plus", new BigDecimal("0.00040"),
            "gpt-4o-mini", new BigDecimal("0.00015")
    );

    @Autowired private AiCostTrackingMapper costTrackingMapper;

    @Async
    public void recordAsync(String modelName, String scene, int promptTokens, int completionTokens, int latencyMs, boolean success, String errorMessage) {
        try {
            AiCostTracking record = new AiCostTracking();
            record.setTenantId(UserContext.tenantId());
            record.setModelName(modelName);
            record.setScene(scene);
            record.setPromptTokens(promptTokens);
            record.setCompletionTokens(completionTokens);
            record.setTotalTokens(promptTokens + completionTokens);
            record.setEstimatedCostUsd(calculateCost(modelName, promptTokens, completionTokens));
            record.setLatencyMs(latencyMs);
            record.setSuccess(success);
            record.setErrorMessage(errorMessage != null && errorMessage.length() > 512 ? errorMessage.substring(0, 512) : errorMessage);
            costTrackingMapper.insert(record);
        } catch (Exception e) {
            log.debug("[AI成本跟踪] 记录失败: {}", e.getMessage());
        }
    }

    public Map<String, Object> getCostSummary(int days) {
        Map<String, Object> summary = new LinkedHashMap<>();
        try {
            Long tenantId = UserContext.tenantId();
            LocalDateTime since = LocalDateTime.now().minusDays(days);
            long totalTokens = costTrackingMapper.sumTokensSince(tenantId, since);
            BigDecimal totalCost = costTrackingMapper.sumCostSince(tenantId, since);
            summary.put("period", days + "天");
            summary.put("totalTokens", totalTokens);
            summary.put("estimatedCostUsd", totalCost != null ? totalCost.setScale(4, RoundingMode.HALF_UP) : BigDecimal.ZERO);
            summary.put("estimatedCostCny", totalCost != null ? totalCost.multiply(new BigDecimal("7.2")).setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO);
        } catch (Exception e) {
            log.warn("[AI成本跟踪] 获取成本汇总失败: {}", e.getMessage());
        }
        return summary;
    }

    private BigDecimal calculateCost(String modelName, int promptTokens, int completionTokens) {
        BigDecimal pricePerK = MODEL_PRICING.getOrDefault(modelName, new BigDecimal("0.00020"));
        return pricePerK.multiply(new BigDecimal(promptTokens + completionTokens))
                .divide(new BigDecimal("1000"), 6, RoundingMode.HALF_UP);
    }
}
