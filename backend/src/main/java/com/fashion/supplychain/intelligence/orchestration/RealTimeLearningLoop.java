package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.entity.IntelligenceFeedbackRecord;
import com.fashion.supplychain.intelligence.mapper.IntelligenceFeedbackRecordMapper;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 实时学习闭环 —— 每次对话结束后立即触发，无需等待用户反馈或定时任务。
 *
 * <p>核心机制：
 * <ul>
 *   <li>对话结束后立即分析执行指标</li>
 *   <li>自动生成内部反馈（SelfCritic结果）</li>
 *   <li>低质量对话实时触发学习分析</li>
 *   <li>高频问题模式实时沉淀记忆</li>
 * </ul>
 */
@Service
@Slf4j
public class RealTimeLearningLoop {

    /** 触发实时学习的最低反馈数 */
    private static final int REAL_TIME_THRESHOLD = 1;
    /** 连续低分触发紧急学习 */
    private static final int CONSECUTIVE_LOW_SCORE_THRESHOLD = 3;

    private final AtomicInteger consecutiveLowScoreCount = new AtomicInteger(0);

    @Autowired
    private IntelligenceFeedbackRecordMapper feedbackMapper;

    @Autowired
    private LearningLoopOrchestrator learningLoopOrchestrator;

    @Autowired
    private IntelligenceMemoryOrchestrator memoryOrchestrator;

    @Autowired(required = false)
    private AiAdvisorService aiAdvisorService;

    // ──────────────────────────────────────────────────────────────

    /**
     * 触发实时学习闭环（异步）。
     *
     * @param sessionId     会话ID
     * @param userMessage   用户问题
     * @param aiResponse    AI回答
     * @param selfScore     自我批评评分
     * @param tenantId      租户ID
     */
    @Async("aiSelfCriticExecutor")
    public void trigger(String sessionId, String userMessage, String aiResponse,
                        double selfScore, Long tenantId) {
        try {
            // 1. 检查是否需要紧急学习（连续低分）
            if (selfScore < 60) {
                int consecutive = consecutiveLowScoreCount.incrementAndGet();
                if (consecutive >= CONSECUTIVE_LOW_SCORE_THRESHOLD) {
                    performEmergencyLearning(sessionId, tenantId);
                    consecutiveLowScoreCount.set(0);
                }
            } else {
                consecutiveLowScoreCount.set(0);
            }

            // 2. 检查未分析反馈数量，达到阈值则触发学习
            long pendingCount = countPendingFeedbacks(tenantId);
            if (pendingCount >= REAL_TIME_THRESHOLD) {
                // 异步触发学习闭环（不阻塞）
                try {
                    learningLoopOrchestrator.runLoop();
                    log.info("[RealTimeLearning] 实时学习闭环已触发，处理了 {} 条反馈", pendingCount);
                } catch (Exception e) {
                    log.warn("[RealTimeLearning] 学习闭环执行失败: {}", e.getMessage());
                }
            }

            // 3. 实时沉淀单条经验（高频模式检测）
            if (selfScore < 75) {
                saveRealTimeInsight(sessionId, userMessage, aiResponse, selfScore);
            }

        } catch (Exception e) {
            log.warn("[RealTimeLearning] 实时学习触发失败（非关键）: {}", e.getMessage());
        }
    }

    /**
     * 紧急学习：连续低分时立即分析并生成改进建议。
     */
    private void performEmergencyLearning(String sessionId, Long tenantId) {
        log.warn("[RealTimeLearning] 触发紧急学习！session={} 连续低分", sessionId);

        try {
            // 查询最近的低分反馈
            LocalDateTime since = LocalDateTime.now().minusHours(1);
            List<IntelligenceFeedbackRecord> recentLowScores = feedbackMapper.selectList(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<IntelligenceFeedbackRecord>()
                            .eq("tenant_id", tenantId)
                            .ge("create_time", since)
                            .orderByDesc("create_time")
                            .last("LIMIT 5"));

            if (recentLowScores.isEmpty()) return;

            // 用AI分析低分模式
            if (aiAdvisorService != null && aiAdvisorService.isEnabled()
                    && aiAdvisorService.checkAndConsumeQuota(tenantId)) {
                String prompt = buildEmergencyAnalysisPrompt(recentLowScores);
                String analysis = aiAdvisorService.chat(
                        "你是AI系统优化专家，分析系统性能问题并提出改进方案。",
                        prompt);

                if (analysis != null && !analysis.isBlank()) {
                    memoryOrchestrator.saveCase(
                            "emergency_learning",
                            "system_optimization",
                            "紧急学习分析 " + LocalDateTime.now(),
                            analysis);
                    log.info("[RealTimeLearning] 紧急学习分析已沉淀");
                }
            }
        } catch (Exception e) {
            log.warn("[RealTimeLearning] 紧急学习失败: {}", e.getMessage());
        }
    }

    /**
     * 实时沉淀单条经验洞察。
     */
    private void saveRealTimeInsight(String sessionId, String userMessage,
                                      String aiResponse, double selfScore) {
        try {
            String insight = String.format(
                    "问题类型：%s | 评分：%.1f | 问题：%s | 回答：%s",
                    detectProblemType(userMessage),
                    selfScore,
                    userMessage.length() > 100 ? userMessage.substring(0, 100) : userMessage,
                    aiResponse.length() > 200 ? aiResponse.substring(0, 200) : aiResponse);

            memoryOrchestrator.saveCase(
                    "realtime_insight",
                    detectDomain(userMessage),
                    String.format("实时洞察 score=%.0f", selfScore),
                    insight);
        } catch (Exception e) {
            log.debug("[RealTimeLearning] 实时洞察保存失败: {}", e.getMessage());
        }
    }

    private long countPendingFeedbacks(Long tenantId) {
        try {
            return feedbackMapper.selectCount(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<IntelligenceFeedbackRecord>()
                            .eq("tenant_id", tenantId)
                            .isNull("feedback_analysis"));
        } catch (Exception e) {
            return 0;
        }
    }

    private String buildEmergencyAnalysisPrompt(List<IntelligenceFeedbackRecord> records) {
        StringBuilder sb = new StringBuilder();
        sb.append("系统在过去1小时内连续出现低质量回答，请分析问题根因并提出改进方案。\n\n");
        sb.append("近期低分记录：\n");
        for (int i = 0; i < records.size(); i++) {
            IntelligenceFeedbackRecord r = records.get(i);
            sb.append(String.format("%d. 类型：%s | 原因：%s | 内容：%s\n",
                    i + 1,
                    r.getSuggestionType(),
                    r.getFeedbackReason(),
                    r.getSuggestionContent() == null ? "" : r.getSuggestionContent().substring(0, Math.min(100, r.getSuggestionContent().length()))));
        }
        sb.append("\n请输出：\n");
        sb.append("1. 根因分析（技术层面+业务层面）\n");
        sb.append("2. 立即改进措施\n");
        sb.append("3. 长期优化建议\n");
        return sb.toString();
    }

    private String detectProblemType(String message) {
        if (message == null) return "unknown";
        String lower = message.toLowerCase();
        if (lower.contains("订单")) return "order";
        if (lower.contains("库存") || lower.contains("物料")) return "inventory";
        if (lower.contains("质量") || lower.contains("质检")) return "quality";
        if (lower.contains("成本") || lower.contains("价格")) return "cost";
        if (lower.contains("工厂") || lower.contains("产能")) return "capacity";
        return "general";
    }

    private String detectDomain(String message) {
        return switch (detectProblemType(message)) {
            case "order" -> "production";
            case "inventory" -> "warehouse";
            case "quality" -> "production";
            case "cost" -> "finance";
            case "capacity" -> "production";
            default -> "general";
        };
    }
}
