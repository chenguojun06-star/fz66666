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
import org.springframework.context.annotation.Lazy;

@Slf4j
@Service
@Lazy
public class AiCostTrackingOrchestrator {

    // D-361：全站统一 deepseek-flash，历史模型价格条目已随模型下线移除
    private static final Map<String, BigDecimal> MODEL_PRICING = Map.of(
            "deepseek-flash", new BigDecimal("0.00014")
    );

    @Autowired private AiCostTrackingMapper costTrackingMapper;

    @Async
    public void recordAsync(String modelName, String scene, int promptTokens, int completionTokens, int latencyMs, boolean success, String errorMessage) {
        try {
            AiCostTracking record = new AiCostTracking();
            // D-700：t_ai_cost_tracking.tenant_id 是 NOT NULL，而后台定时任务没有 UserContext
            // → tenantId 为 null → INSERT 失败 → 过去配合下面的 log.debug 变成完全静默。
            // 成本账必须记全：定时任务花的钱也是钱，统一归到 tenant 0（系统/后台）桶。
            Long tenantId = UserContext.tenantId();
            record.setTenantId(tenantId != null ? tenantId : 0L);
            record.setModelName(modelName);
            record.setScene(scene);
            record.setPromptTokens(promptTokens);
            record.setCompletionTokens(completionTokens);
            record.setTotalTokens(promptTokens + completionTokens);
            record.setEstimatedCostUsd(calculateCost(modelName, promptTokens, completionTokens));
            record.setLatencyMs(latencyMs);
            record.setCreatedAt(LocalDateTime.now());
            record.setSuccess(success);
            record.setErrorMessage(errorMessage != null && errorMessage.length() > 512 ? errorMessage.substring(0, 512) : errorMessage);
            costTrackingMapper.insert(record);
        } catch (Exception e) {
            // D-700：必须 warn 而非 debug。此前这里是 debug，导致「成本表恒为 0 行」
            // 这种 P0 故障可以安静存在几个月没人发现（根因是实体列名不匹配，INSERT 必失败）。
            // 成本记账是兜底能力，它挂了不能没有声音。
            log.warn("[AI成本跟踪] 记录失败（成本归因将出现缺口）: {}", e.getMessage());
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
