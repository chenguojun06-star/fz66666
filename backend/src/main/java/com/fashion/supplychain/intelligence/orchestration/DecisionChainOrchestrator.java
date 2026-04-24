package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.entity.DecisionMemory;
import com.fashion.supplychain.intelligence.mapper.DecisionMemoryMapper;
import java.time.LocalDateTime;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 决策闭环编排器 — 阶段1-4核心：记住 → 追踪 → 教训。
 *
 * <p>与 IntelligenceMemoryOrchestrator 区别：Memory 存的是通用经验案例，
 * 本编排器存的是结构化「决策→行动→结果→教训」四元组闭环。</p>
 *
 * <p>租户隔离：所有操作严格带 tenant_id，不跨租户读写。</p>
 */
@Slf4j
@Service
public class DecisionChainOrchestrator {

    @Autowired private DecisionMemoryMapper decisionMemoryMapper;
    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    /**
     * 记录一次决策（Graph 执行后自动调用）。
     */
    @Transactional(rollbackFor = Exception.class)
    public DecisionMemory recordDecision(AgentState state, String decisionContent, String rationale) {
        Long tenantId = state.getTenantId();
        DecisionMemory dm = new DecisionMemory();
        dm.setTenantId(tenantId);
        dm.setDecisionType(mapSceneToType(state.getScene()));
        dm.setScene(state.getScene());
        dm.setContextSnapshot(state.toJson());
        dm.setDecisionContent(decisionContent);
        dm.setRationale(rationale);
        dm.setLinkedOrderIds(state.getOrderIds() != null ? String.join(",", state.getOrderIds()) : null);
        dm.setAgentSource("multi_agent_graph");
        dm.setExecutionId(state.getExecutionId());
        dm.setConfidenceAtDecision(state.getConfidenceScore());
        dm.setStatus("pending");
        dm.setDeleteFlag(0);
        dm.setCreateTime(LocalDateTime.now());
        dm.setUpdateTime(LocalDateTime.now());
        decisionMemoryMapper.insert(dm);
        log.info("[DecisionChain] 记录决策 id={} tenant={} type={}", dm.getId(), tenantId, dm.getDecisionType());
        return dm;
    }

    /**
     * 回填结果 — 当决策产生实际效果时调用。
     */
    @Transactional(rollbackFor = Exception.class)
    public void recordOutcome(Long decisionId, String actualOutcome, int outcomeScore) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        DecisionMemory dm = decisionMemoryMapper.selectOne(
                new QueryWrapper<DecisionMemory>()
                        .eq("id", decisionId)
                        .eq("tenant_id", tenantId)
                        .eq("delete_flag", 0));
        if (dm == null) {
            log.warn("[DecisionChain] 决策不存在或无权访问 id={} tenant={}", decisionId, tenantId);
            return;
        }
        dm.setActualOutcome(actualOutcome);
        dm.setOutcomeScore(outcomeScore);
        dm.setStatus("outcome_recorded");
        dm.setUpdateTime(LocalDateTime.now());
        decisionMemoryMapper.updateById(dm);
        log.info("[DecisionChain] 回填结果 id={} score={}", decisionId, outcomeScore);
    }

    /**
     * AI 提炼教训 — 对已回填结果的决策，用 LLM 提取经验教训。
     */
    @Transactional(rollbackFor = Exception.class)
    public String extractLesson(Long decisionId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        DecisionMemory dm = decisionMemoryMapper.selectOne(
                new QueryWrapper<DecisionMemory>()
                        .eq("id", decisionId)
                        .eq("tenant_id", tenantId)
                        .eq("delete_flag", 0));
        if (dm == null || !"outcome_recorded".equals(dm.getStatus())) {
            return "决策不存在或尚未记录结果";
        }

        String prompt = String.format(
                "决策类型：%s\n场景：%s\n决策内容：%s\n决策理由：%s\n预期结果：%s\n实际结果：%s\n结果评分：%d/100\n"
                        + "请用2-3句话总结这次决策的教训，指出成功点和改进空间。",
                dm.getDecisionType(), dm.getScene(), dm.getDecisionContent(),
                dm.getRationale(), dm.getExpectedOutcome(), dm.getActualOutcome(),
                dm.getOutcomeScore() != null ? dm.getOutcomeScore() : 0);

        String lesson;
        var result = inferenceOrchestrator.chat("decision-lesson",
                "你是服装供应链决策复盘专家，擅长从决策结果中提炼可复用的教训。", prompt);
        if (result.isSuccess() && result.getContent() != null && !result.getContent().isBlank()) {
            lesson = result.getContent().trim();
        } else {
            lesson = dm.getOutcomeScore() != null && dm.getOutcomeScore() >= 70
                    ? "决策效果良好，可作为同类场景参考。" : "决策效果不及预期，后续同类场景需加强风险评估。";
        }

        dm.setLessonLearned(lesson);
        dm.setConfidenceAfterOutcome(dm.getOutcomeScore());
        dm.setStatus("lesson_extracted");
        dm.setUpdateTime(LocalDateTime.now());
        decisionMemoryMapper.updateById(dm);
        log.info("[DecisionChain] 提炼教训 id={} lesson长度={}", decisionId, lesson.length());
        return lesson;
    }

    /**
     * 检索同租户、同类型的历史决策教训（给 Reflection 横向比对用）。
     */
    public List<DecisionMemory> recallSimilarDecisions(Long tenantId, String decisionType, int limit) {
        return decisionMemoryMapper.selectList(
                new QueryWrapper<DecisionMemory>()
                        .eq("tenant_id", tenantId)
                        .eq("decision_type", decisionType)
                        .eq("delete_flag", 0)
                        .isNotNull("lesson_learned")
                        .orderByDesc("outcome_score")
                        .last("LIMIT " + Math.min(limit, 10)));
    }

    private String mapSceneToType(String scene) {
        if (scene == null) return "delivery";
        return switch (scene) {
            case "delivery_risk" -> "delivery";
            case "sourcing" -> "sourcing";
            case "compliance" -> "quality";
            case "logistics" -> "delivery";
            default -> "delivery";
        };
    }
}
