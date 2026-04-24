package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.entity.AiPlan;
import com.fashion.supplychain.intelligence.mapper.AiPlanMapper;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Plan-and-Execute 编排器
 * <p>负责复杂任务的"先规划再执行"。普通租户只能看到自己计划，
 * 平台超管聚合所有租户计划用于训练。</p>
 */
@Slf4j
@Service
public class AiPlanExecuteOrchestrator {

    @Autowired
    private AiPlanMapper aiPlanMapper;

    /**
     * 创建新计划（PLANNING 状态）
     */
    public AiPlan createPlan(String sessionId, String goal, String planJson, int totalSteps,
                             String traceId) {
        AiPlan plan = new AiPlan();
        plan.setPlanUid(UUID.randomUUID().toString().replace("-", ""));
        plan.setTenantId(UserContext.tenantId());
        plan.setUserId(UserContext.userId());
        plan.setUserName(UserContext.username());
        plan.setSessionId(sessionId);
        plan.setGoal(goal);
        plan.setPlanJson(planJson);
        plan.setTotalSteps(totalSteps);
        plan.setCompletedSteps(0);
        plan.setCurrentStep(0);
        plan.setStatus("PLANNING");
        plan.setVisibility("TENANT");
        plan.setReplanCount(0);
        plan.setTraceId(traceId);
        plan.setCreateTime(LocalDateTime.now());
        plan.setUpdateTime(LocalDateTime.now());
        aiPlanMapper.insert(plan);
        return plan;
    }

    public void markExecuting(Long planId) {
        AiPlan p = new AiPlan();
        p.setId(planId);
        p.setStatus("EXECUTING");
        p.setUpdateTime(LocalDateTime.now());
        aiPlanMapper.updateById(p);
    }

    public void advanceStep(Long planId, int currentStep, int completedSteps) {
        AiPlan p = new AiPlan();
        p.setId(planId);
        p.setCurrentStep(currentStep);
        p.setCompletedSteps(completedSteps);
        p.setUpdateTime(LocalDateTime.now());
        aiPlanMapper.updateById(p);
    }

    public void finishPlan(Long planId, String status, String finalResult, String errorMessage,
                           Integer tokens, Long durationMs) {
        AiPlan p = new AiPlan();
        p.setId(planId);
        p.setStatus(status);
        p.setFinalResult(finalResult);
        p.setErrorMessage(errorMessage);
        p.setTotalTokens(tokens);
        p.setTotalDurationMs(durationMs);
        p.setUpdateTime(LocalDateTime.now());
        aiPlanMapper.updateById(p);
    }

    public void incrementReplan(Long planId) {
        AiPlan p = aiPlanMapper.selectById(planId);
        if (p == null) return;
        p.setReplanCount((p.getReplanCount() == null ? 0 : p.getReplanCount()) + 1);
        p.setStatus("REPLANNING");
        p.setUpdateTime(LocalDateTime.now());
        aiPlanMapper.updateById(p);
    }

    /**
     * 列租户内计划。仅当前租户可见。
     */
    public java.util.List<AiPlan> listForCurrentTenant(int limit) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<AiPlan> w = new LambdaQueryWrapper<>();
        if (tenantId != null) {
            w.eq(AiPlan::getTenantId, tenantId);
        }
        w.orderByDesc(AiPlan::getId).last("LIMIT " + Math.min(Math.max(limit, 1), 200));
        return aiPlanMapper.selectList(w);
    }
}
