package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.LearningLoopResponse;
import com.fashion.supplychain.intelligence.entity.IntelligenceFeedbackRecord;
import com.fashion.supplychain.intelligence.mapper.IntelligenceFeedbackRecordMapper;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 学习闭环编排器
 *
 * <p>处理近期的反馈记录，用 AI 提炼规律，
 * 高频模式沉淀为 IntelligenceMemory，形成持续改进闭环。
 *
 * <p>调用时机：每天定时 + 手动触发。
 */
@Service
@Slf4j
public class LearningLoopOrchestrator {

    /** 反馈重复出现此次数后沉淀为记忆 */
    private static final int PATTERN_THRESHOLD = 3;
    /** 每次处理的最大未分析反馈条数 */
    private static final int MAX_BATCH = 20;

    @Autowired
    private IntelligenceFeedbackRecordMapper feedbackMapper;

    @Autowired
    private AiAdvisorService aiAdvisorService;

    @Autowired
    private IntelligenceMemoryOrchestrator memoryOrchestrator;

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    // ──────────────────────────────────────────────────────────────

    /**
     * 执行一次学习闭环。
     *
     * <ol>
     *   <li>查询近 7 天还未 AI 分析的反馈</li>
     *   <li>调用 AI 生成分析结论并回写 DB</li>
     *   <li>归因聚合：同一 suggestionType 拒绝次数 >= threshold → 沉淀记忆</li>
     *   <li>返回本轮统计</li>
     * </ol>
     */
    @Transactional(rollbackFor = Exception.class)
    public LearningLoopResponse runLoop() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LearningLoopResponse response = new LearningLoopResponse();
        response.setRunAt(LocalDateTime.now());

        if (!isFeedbackRecordTableReady()) {
            response.setSummary("学习闭环反馈表仍为历史结构，已跳过分析，避免触发运行时 SQL 异常");
            return response;
        }

        // 1. 查询待分析的反馈
        LocalDateTime since = LocalDateTime.now().minusDays(7);
        List<IntelligenceFeedbackRecord> pending = feedbackMapper.selectList(
                new QueryWrapper<IntelligenceFeedbackRecord>()
                        .eq("tenant_id", tenantId)
                        .isNull("feedback_analysis")
                        .ge("create_time", since)
                        .orderByAsc("create_time")
                        .last("LIMIT " + MAX_BATCH));

        response.setAnalyzedFeedbacks(pending.size());
        if (pending.isEmpty()) {
            response.setSummary("暂无待分析的反馈记录");
            return response;
        }

        // 2. AI 逐条分析（降级安全）
        int aiAnalyzed = 0;
        boolean aiEnabled = aiAdvisorService.isEnabled();
        for (IntelligenceFeedbackRecord fb : pending) {
            if (aiEnabled && aiAdvisorService.checkAndConsumeQuota(tenantId)) {
                try {
                    String prompt = buildAnalysisPrompt(fb);
                    String analysis = aiAdvisorService.chat(
                            "你是供应链AI顾问，专注预测偏差分析与持续改进。", prompt);
                    if (analysis != null && !analysis.isBlank()) {
                        fb.setFeedbackAnalysis(analysis.trim());
                        fb.setUpdateTime(LocalDateTime.now());
                        feedbackMapper.updateById(fb);
                        aiAnalyzed++;
                    }
                } catch (Exception e) {
                    log.warn("[学习闭环] AI分析失败 feedbackId={}: {}", fb.getId(), e.getMessage());
                }
            }
        }
        response.setAiAnalyzedCount(aiAnalyzed);

        // 3. 归因聚合 — 同类型被拒绝次数频繁则沉淀记忆
        List<String> patterns = new ArrayList<>();
        Map<String, List<IntelligenceFeedbackRecord>> byType = pending.stream()
                .filter(fb -> "rejected".equals(fb.getFeedbackResult()))
                .collect(Collectors.groupingBy(
                        fb -> fb.getSuggestionType() == null ? "unknown" : fb.getSuggestionType()));

        int learnedCount = 0;
        for (Map.Entry<String, List<IntelligenceFeedbackRecord>> entry : byType.entrySet()) {
            String type = entry.getKey();
            List<IntelligenceFeedbackRecord> rejections = entry.getValue();
            if (rejections.size() >= PATTERN_THRESHOLD) {
                String patternSummary = buildPatternSummary(type, rejections);
                patterns.add(patternSummary);
                // 沉淀为记忆
                try {
                    memoryOrchestrator.saveCase(
                            "knowledge",
                            mapDomain(type),
                            type + " 类建议反复被拒绝 — 改进规律",
                            patternSummary);
                    learnedCount++;
                } catch (Exception e) {
                    log.warn("[学习闭环] 沉淀记忆失败 type={}: {}", type, e.getMessage());
                }
            }
        }

        response.setLearnedToMemory(learnedCount);
        response.setHasNewLearning(learnedCount > 0);
        response.setDiscoveredPatterns(patterns);
        response.setSummary(String.format(
                "本次处理 %d 条反馈，AI分析 %d 条，沉淀 %d 条规律记忆",
                pending.size(), aiAnalyzed, learnedCount));

        log.info("[学习闭环] tenantId={} analyzed={} aiAnalyzed={} learned={}",
                tenantId, pending.size(), aiAnalyzed, learnedCount);
        return response;
    }

    // ──────────────────────────────────────────────────────────────

    private String buildAnalysisPrompt(IntelligenceFeedbackRecord fb) {
        String action = "rejected".equals(fb.getFeedbackResult()) ? "拒绝" : "采纳";
        return String.format(
                "供应链AI建议（类型：%s）被用户%s。\n建议内容：%s\n用户反馈原因：%s\n"
                + "偏差分钟数：%s\n请用2-3句话分析：①为什么被%s ②系统应学到什么 ③下次如何改进",
                fb.getSuggestionType(),
                action,
                fb.getSuggestionContent() == null ? "（无详情）" : fb.getSuggestionContent(),
                fb.getFeedbackReason() == null ? "（无说明）" : fb.getFeedbackReason(),
                fb.getDeviationMinutes() == null ? "未知" : fb.getDeviationMinutes(),
                action);
    }

    private String buildPatternSummary(String type, List<IntelligenceFeedbackRecord> rejections) {
        long count = rejections.size();
        String reasons = rejections.stream()
                .filter(fb -> fb.getFeedbackReason() != null)
                .map(IntelligenceFeedbackRecord::getFeedbackReason)
                .distinct()
                .limit(3)
                .collect(Collectors.joining("；"));
        return String.format(
                "%s 类建议在近7天被拒绝 %d 次。主要原因：%s。系统应调整此类预测的阈值或逻辑。",
                type, count, reasons.isEmpty() ? "未说明" : reasons);
    }

    private String mapDomain(String suggestionType) {
        if (suggestionType == null) return "production";
        return switch (suggestionType) {
            case "assignment" -> "production";
            case "quote" -> "finance";
            case "delivery" -> "production";
            case "anomaly" -> "production";
            default -> "production";
        };
    }

    private volatile Boolean feedbackRecordTableReady = null;
    private final java.util.concurrent.locks.ReentrantLock schemaCheckLock = new java.util.concurrent.locks.ReentrantLock();

    private boolean isFeedbackRecordTableReady() {
        if (feedbackRecordTableReady != null) {
            return feedbackRecordTableReady;
        }
        schemaCheckLock.lock();
        try {
            if (feedbackRecordTableReady != null) {
                return feedbackRecordTableReady;
            }
            if (jdbcTemplate == null) {
                feedbackRecordTableReady = false;
                return false;
            }
            try {
                Integer requiredColumns = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                                + "WHERE TABLE_SCHEMA = DATABASE() "
                                + "AND TABLE_NAME = 't_intelligence_feedback' "
                                + "AND COLUMN_NAME IN ('prediction_id','suggestion_type','feedback_result',"
                                + "'feedback_reason','feedback_analysis','deviation_minutes','create_time','update_time')",
                        Integer.class);
                feedbackRecordTableReady = requiredColumns != null && requiredColumns == 8;
            } catch (Exception e) {
                log.warn("[学习闭环] 检测 t_intelligence_feedback 结构失败，按跳过处理: {}", e.getMessage());
                feedbackRecordTableReady = false;
            }
            return feedbackRecordTableReady;
        } finally {
            schemaCheckLock.unlock();
        }
    }
}
