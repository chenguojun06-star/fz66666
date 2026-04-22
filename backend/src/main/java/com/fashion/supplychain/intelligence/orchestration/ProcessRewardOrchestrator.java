package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiProcessReward;
import com.fashion.supplychain.intelligence.mapper.AiProcessRewardMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Process Reward Model 编排器
 * <p>记录每次工具调用的有用性评分。租户内可见自身评分；
 * 平台超管聚合所有租户评分以提升 AgentTool 排序与调用策略。</p>
 */
@Slf4j
@Service
public class ProcessRewardOrchestrator {

    @Autowired
    private AiProcessRewardMapper rewardMapper;

    /**
     * 记录一次工具调用评分。score: -2~+2。
     */
    public void record(String sessionId, Long planId, Integer stepIndex, String toolName,
                       String toolInput, String outputSummary, int score, String reason,
                       String scoreSource, String outcome, Integer durationMs, Integer tokenCost,
                       String scene) {
        try {
            AiProcessReward r = new AiProcessReward();
            r.setTenantId(UserContext.tenantId());
            r.setSessionId(sessionId);
            r.setPlanId(planId);
            r.setStepIndex(stepIndex);
            r.setToolName(toolName);
            r.setToolInput(safeTruncate(toolInput, 4000));
            r.setToolOutputSummary(safeTruncate(outputSummary, 2000));
            r.setScore(Math.max(-2, Math.min(2, score)));
            r.setScoreReason(reason);
            r.setScoreSource(scoreSource == null ? "AUTO" : scoreSource);
            r.setOutcome(outcome);
            r.setDurationMs(durationMs);
            r.setTokenCost(tokenCost);
            r.setScene(scene);
            r.setCreateTime(LocalDateTime.now());
            rewardMapper.insert(r);
        } catch (Exception e) {
            log.warn("[PRM] 记录工具评分失败 tool={}, err={}", toolName, e.getMessage());
        }
    }

    /**
     * 平台级（超管）：跨租户工具表现聚合
     */
    public List<Map<String, Object>> aggregateToolPerformance(LocalDateTime since) {
        return rewardMapper.aggregateToolPerformance(since);
    }

    /**
     * 单租户：本租户工具表现
     */
    public List<Map<String, Object>> aggregateForCurrentTenant(LocalDateTime since) {
        Long tid = UserContext.tenantId();
        if (tid == null) return java.util.Collections.emptyList();
        return rewardMapper.aggregateToolByTenant(tid, since);
    }

    /**
     * 获取当前租户近 N 天高分工具映射 toolName → avgScore（avgScore > 0 才入表）。
     * 用于 AiAgentToolAdvisor 做 PRM 引导的工具优先级提升：
     * 用户历史点赞最多的工具，在同类意图中排在前面。
     */
    public Map<String, Double> getHighScoreToolsForCurrentTenant(int days) {
        Long tid = UserContext.tenantId();
        if (tid == null) return java.util.Collections.emptyMap();
        LocalDateTime since = LocalDateTime.now().minusDays(Math.max(1, days));
        List<Map<String, Object>> rows = rewardMapper.aggregateToolByTenant(tid, since);
        Map<String, Double> result = new java.util.LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Object toolName = row.get("tool_name");
            Object avgScore = row.get("avg_score");
            if (toolName != null && avgScore != null) {
                double avg = ((Number) avgScore).doubleValue();
                if (avg > 0) {
                    result.put(toolName.toString(), avg);
                }
            }
        }
        return result;
    }

    /**
     * 最近 N 条评分记录（仅当前租户）
     */
    public List<AiProcessReward> recentForCurrentTenant(int limit) {
        Long tid = UserContext.tenantId();
        LambdaQueryWrapper<AiProcessReward> w = new LambdaQueryWrapper<>();
        if (tid != null) w.eq(AiProcessReward::getTenantId, tid);
        w.orderByDesc(AiProcessReward::getId).last("LIMIT " + Math.min(Math.max(limit, 1), 200));
        return rewardMapper.selectList(w);
    }

    private String safeTruncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
