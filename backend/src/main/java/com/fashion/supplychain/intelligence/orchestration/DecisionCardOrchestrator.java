package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiDecisionCard;
import com.fashion.supplychain.intelligence.mapper.AiDecisionCardMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

/**
 * 可解释决策卡编排器
 * <p>每条 AI 建议附数据依据/推理路径/不确定性，便于复盘与训练。
 * <br>租户内可见自身卡片；超管聚合采纳率指标。</p>
 */
@Slf4j
@Service
@Lazy
public class DecisionCardOrchestrator {

    @Autowired
    private AiDecisionCardMapper cardMapper;

    public AiDecisionCard create(String sessionId, Long planId, String scene, String question,
                                 String recommendation, String dataEvidenceJson,
                                 String reasoningPathJson, String uncertaintyJson,
                                 BigDecimal confidence, String riskLevel, String traceId) {
        AiDecisionCard c = new AiDecisionCard();
        c.setCardUid(UUID.randomUUID().toString().replace("-", ""));
        c.setTenantId(UserContext.tenantId());
        c.setUserId(UserContext.userId());
        c.setSessionId(sessionId);
        c.setPlanId(planId);
        c.setScene(scene);
        c.setQuestion(question);
        c.setRecommendation(recommendation);
        c.setDataEvidenceJson(dataEvidenceJson);
        c.setReasoningPathJson(reasoningPathJson);
        c.setUncertaintyJson(uncertaintyJson);
        c.setConfidence(confidence);
        c.setRiskLevel(riskLevel == null ? "MEDIUM" : riskLevel);
        c.setTraceId(traceId);
        c.setAdopted(0);
        c.setCreateTime(LocalDateTime.now());
        c.setUpdateTime(LocalDateTime.now());
        cardMapper.insert(c);
        return c;
    }

    /**
     * 用户反馈：1 采纳，-1 拒绝。
     *
     * <p>D-858：显式校验卡片归属再更新。
     * <p>TenantInterceptor 会给 SELECT/UPDATE 自动补 tenant_id，跨租户本就读不到/改不到；
     * 但 {@code updateById} 命中 0 行时**不报错**，调用方（前端）仍显示采纳成功，
     * 形成「静默无效」。这里先按 id 查一次（同样受租户过滤），查不到或归属不符就留痕拒绝。
     */
    public void feedback(Long cardId, int adopted, String reason, Integer feedbackScore) {
        if (cardId == null) {
            log.warn("[DecisionCard] 反馈被拒绝：cardId 为空");
            return;
        }
        Long tenantId = UserContext.tenantId();
        AiDecisionCard existing = cardMapper.selectById(cardId);
        if (existing == null) {
            log.warn("[DecisionCard] 反馈被拒绝：卡片不存在或不可见 cardId={} tenantId={}", cardId, tenantId);
            return;
        }
        if (tenantId != null && existing.getTenantId() != null && !tenantId.equals(existing.getTenantId())) {
            log.warn("[DecisionCard] 拒绝跨租户反馈 cardId={} currentTenant={} cardTenant={}",
                    cardId, tenantId, existing.getTenantId());
            return;
        }

        AiDecisionCard c = new AiDecisionCard();
        c.setId(cardId);
        c.setAdopted(adopted);
        c.setAdoptionTime(LocalDateTime.now());
        c.setAdoptionReason(reason);
        c.setFeedbackScore(feedbackScore);
        c.setUpdateTime(LocalDateTime.now());
        cardMapper.updateById(c);
    }

    public AiDecisionCard get(Long cardId) {
        return cardMapper.selectById(cardId);
    }

    public List<AiDecisionCard> recentForCurrentTenant(int limit) {
        Long tid = UserContext.tenantId();
        // D-858：无租户上下文直接返回空，不依赖 TenantInterceptor 的隐式兜底。
        // 拦截器在 tenantId=null 时对业务表拼 1=0（返回空），但 UserContext 整体为 null
        // 的后台线程会直接放行 → 全表；显式判空把这条路径也堵上。
        if (tid == null) {
            log.warn("[DecisionCard] 无租户上下文，跳过建议查询（防跨租户）");
            return java.util.Collections.emptyList();
        }
        LambdaQueryWrapper<AiDecisionCard> w = new LambdaQueryWrapper<>();
        w.eq(AiDecisionCard::getTenantId, tid);
        w.orderByDesc(AiDecisionCard::getId).last("LIMIT " + Math.min(Math.max(limit, 1), 200));
        return cardMapper.selectList(w);
    }

    /**
     * 平台超管：采纳率聚合
     */
    public List<Map<String, Object>> aggregateAdoption(LocalDateTime since) {
        return cardMapper.aggregateAdoptionByScene(since);
    }

    /**
     * 单租户：采纳率聚合
     */
    public List<Map<String, Object>> aggregateByTenant(Long tenantId, LocalDateTime since) {
        return cardMapper.aggregateAdoptionByTenant(tenantId, since);
    }
}
