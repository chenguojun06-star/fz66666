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

/**
 * 可解释决策卡编排器
 * <p>每条 AI 建议附数据依据/推理路径/不确定性，便于复盘与训练。
 * <br>租户内可见自身卡片；超管聚合采纳率指标。</p>
 */
@Slf4j
@Service
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
     * 用户反馈：1 采纳，-1 拒绝
     */
    public void feedback(Long cardId, int adopted, String reason, Integer feedbackScore) {
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
        LambdaQueryWrapper<AiDecisionCard> w = new LambdaQueryWrapper<>();
        if (tid != null) w.eq(AiDecisionCard::getTenantId, tid);
        w.orderByDesc(AiDecisionCard::getId).last("LIMIT " + Math.min(Math.max(limit, 1), 200));
        return cardMapper.selectList(w);
    }

    /**
     * 平台超管：采纳率聚合
     */
    public List<Map<String, Object>> aggregateAdoption(LocalDateTime since) {
        return cardMapper.aggregateAdoptionByScene(since);
    }
}
