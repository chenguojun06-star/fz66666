package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
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

    /**
     * D-702：一次推理的成本明细。
     *
     * <p>改为参数对象而非继续加位置参数 —— 已有 7 个位置参数、3 个调用点，
     * 再加 cacheHit/cacheMiss 会变成 9 个，几乎无法在不读注释的情况下正确调用
     * （且极易错位）。这与「同一能力只保留一个出口」是同一条纪律。
     */
    public record InferenceCost(
            String modelName,
            String scene,
            int promptTokens,
            int completionTokens,
            int cacheHitTokens,
            int cacheMissTokens,
            int latencyMs,
            boolean success,
            String errorMessage) {

        public static InferenceCost of(IntelligenceInferenceResult r, String scene) {
            return new InferenceCost(
                    r.getModel() != null ? r.getModel() : r.getProvider(),
                    scene,
                    r.getPromptTokens(),
                    r.getCompletionTokens(),
                    r.getPromptCacheHitTokens(),
                    r.getPromptCacheMissTokens(),
                    (int) r.getLatencyMs(),
                    r.isSuccess(),
                    r.getErrorMessage());
        }
    }

    @Async
    public void recordAsync(InferenceCost cost) {
        try {
            AiCostTracking record = new AiCostTracking();
            // D-700：t_ai_cost_tracking.tenant_id 是 NOT NULL，而后台定时任务没有 UserContext
            // → tenantId 为 null → INSERT 失败 → 过去配合下面的 log.debug 变成完全静默。
            // 成本账必须记全：定时任务花的钱也是钱，统一归到 tenant 0（系统/后台）桶。
            Long tenantId = UserContext.tenantId();
            record.setTenantId(tenantId != null ? tenantId : 0L);
            record.setModelName(cost.modelName());
            record.setScene(cost.scene());
            record.setPromptTokens(cost.promptTokens());
            record.setCompletionTokens(cost.completionTokens());
            record.setPromptCacheHitTokens(cost.cacheHitTokens());
            record.setPromptCacheMissTokens(cost.cacheMissTokens());
            record.setTotalTokens(cost.promptTokens() + cost.completionTokens());
            record.setEstimatedCostUsd(calculateCost(cost.modelName(), cost.promptTokens(), cost.completionTokens()));
            record.setLatencyMs(cost.latencyMs());
            record.setCreatedAt(LocalDateTime.now());
            record.setSuccess(cost.success());
            String err = cost.errorMessage();
            record.setErrorMessage(err != null && err.length() > 512 ? err.substring(0, 512) : err);
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

    /**
     * D-702：Prompt 缓存命中率（数据库口径）。
     *
     * <p><b>为什么不用 {@code IntelligenceObservabilityOrchestrator#getCacheHitRate()}</b>：
     * 那份数据只累计在内存 AtomicLong 里，重启清零、无历史、无法看趋势，
     * 且唯一会打印它的日志行被 {@code shouldRecord()} 门控 ——
     * 而 {@code ai.observability.enabled} 默认 false、{@code provider} 默认 none
     * （线上未配置）→ 那行日志永不执行。此方法以落库数据为准，
     * 是可持久、可回溯、可按场景下钻的口径。
     *
     * @param days 回看天数
     * @return 命中率（0~1）、命中/未命中 token、按天趋势、按场景分布
     */
    public Map<String, Object> getCacheHitSummary(int days) {
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            Long tenantId = UserContext.tenantId();
            LocalDateTime since = LocalDateTime.now().minusDays(Math.max(1, days));

            long hit = 0L;
            long miss = 0L;
            for (Map<String, Object> row : costTrackingMapper.cacheHitTrendSince(tenantId, since)) {
                hit += toLong(row.get("hitTokens"));
                miss += toLong(row.get("missTokens"));
            }
            long total = hit + miss;
            out.put("period", days + "天");
            out.put("hitTokens", hit);
            out.put("missTokens", miss);
            out.put("cacheHitRate", total > 0 ? round4((double) hit / total) : 0.0d);
            out.put("byDay", costTrackingMapper.cacheHitTrendSince(tenantId, since));
            out.put("byScene", costTrackingMapper.cacheHitBySceneSince(tenantId, since));
            // 缓存未命中才是花钱的部分，miss 占比高说明前缀不稳定，值得做优化
            out.put("verdict", verdict(total > 0 ? (double) hit / total : 0.0d, hit + miss));
        } catch (Exception e) {
            log.warn("[AI成本跟踪] 获取缓存命中率失败: {}", e.getMessage());
            out.put("error", e.getMessage());
        }
        return out;
    }

    /**
     * 缓存命中率判读口径（调研：Prompt Caching 可降本 45–80%，arXiv 2601.06007）。
     * 阈值取自「命中率越高收益越大」的经验分档，避免使用者自行判断。
     */
    private String verdict(double rate, long totalTokens) {
        if (totalTokens == 0) return "no_data：本周期无模型返回缓存字段，无法判断（可能是流式估算口径或调用量太少）";
        double pct = rate * 100;
        if (pct >= 60) return String.format("good：命中率 %.1f%%，已获大部分缓存收益", pct);
        if (pct >= 25) return String.format("fair：命中率 %.1f%%，仍有明显优化空间（建议检查 system prompt 是否含变动内容）", pct);
        return String.format("poor：命中率 %.1f%%，前缀不稳定导致缓存基本未生效，"
                + "优先检查 system prompt 开头是否拼接了时间/租户/用户名等每次都变的内容", pct);
    }

    private static long toLong(Object v) {
        return v instanceof Number n ? n.longValue() : 0L;
    }

    private static double round4(double v) {
        return BigDecimal.valueOf(v).setScale(4, RoundingMode.HALF_UP).doubleValue();
    }

    private BigDecimal calculateCost(String modelName, int promptTokens, int completionTokens) {
        BigDecimal pricePerK = MODEL_PRICING.getOrDefault(modelName, new BigDecimal("0.00020"));
        return pricePerK.multiply(new BigDecimal(promptTokens + completionTokens))
                .divide(new BigDecimal("1000"), 6, RoundingMode.HALF_UP);
    }
}
