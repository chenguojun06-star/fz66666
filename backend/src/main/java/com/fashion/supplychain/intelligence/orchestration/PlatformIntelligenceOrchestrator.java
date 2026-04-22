package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.AiPlatformAggregate;
import com.fashion.supplychain.intelligence.mapper.AiPlatformAggregateMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 平台级智能聚合编排器（仅供超管/云裳智链平台使用）
 * <p>从 PRM/决策卡/巡检/工序记录中跨租户聚合，写入 t_ai_platform_aggregate；
 * 该编排器禁止暴露给普通租户接口，所有调用方必须自行做超管校验。</p>
 */
@Slf4j
@Service
public class PlatformIntelligenceOrchestrator {

    @Autowired
    private AiPlatformAggregateMapper aggregateMapper;

    @Autowired
    private ProcessRewardOrchestrator rewardOrchestrator;

    @Autowired
    private DecisionCardOrchestrator decisionCardOrchestrator;

    @Autowired
    private PatrolClosedLoopOrchestrator patrolOrchestrator;

    /**
     * 综合面板：直接返回各项跨租户实时聚合，仅供平台超管接口使用
     */
    public Map<String, Object> superDashboard(LocalDateTime since) {
        Map<String, Object> data = new HashMap<>();
        data.put("toolPerformance", rewardOrchestrator.aggregateToolPerformance(since));
        data.put("decisionAdoption", decisionCardOrchestrator.aggregateAdoption(since));
        data.put("patrolMttr", patrolOrchestrator.aggregateMttr(since));
        data.put("since", since);
        data.put("generatedAt", LocalDateTime.now());
        return data;
    }

    /**
     * 写入平台聚合度量
     */
    public void writeAggregate(String metricKey, String metricDim, String period,
                               LocalDateTime periodStart, LocalDateTime periodEnd, Long tenantId,
                               BigDecimal value, Long count) {
        AiPlatformAggregate a = new AiPlatformAggregate();
        a.setMetricKey(metricKey);
        a.setMetricDim(metricDim);
        a.setPeriod(period);
        a.setPeriodStart(periodStart);
        a.setPeriodEnd(periodEnd);
        a.setTenantId(tenantId);
        a.setMetricValue(value);
        a.setMetricCount(count);
        a.setCreateTime(LocalDateTime.now());
        aggregateMapper.insert(a);
    }

    public List<AiPlatformAggregate> recent(String metricKey, int limit) {
        LambdaQueryWrapper<AiPlatformAggregate> w = new LambdaQueryWrapper<>();
        if (metricKey != null) w.eq(AiPlatformAggregate::getMetricKey, metricKey);
        w.orderByDesc(AiPlatformAggregate::getId).last("LIMIT " + Math.min(Math.max(limit, 1), 500));
        return aggregateMapper.selectList(w);
    }
}
