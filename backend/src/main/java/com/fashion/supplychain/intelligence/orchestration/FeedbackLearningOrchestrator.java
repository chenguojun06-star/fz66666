package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.FeedbackRequest;
import com.fashion.supplychain.intelligence.dto.FeedbackResponse;
import com.fashion.supplychain.intelligence.entity.IntelligencePredictionLog;
import com.fashion.supplychain.intelligence.entity.IntelligenceFeedbackRecord;
import com.fashion.supplychain.intelligence.mapper.IntelligenceFeedbackRecordMapper;
import com.fashion.supplychain.intelligence.mapper.IntelligencePredictionLogMapper;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 反馈闭环编排器 — 完成数据飞轮的最后一环
 *
 * <p>当用户提交实际完成时间后：
 * <ol>
 *   <li>查找匹配的预测记录（通过 prediction_id）</li>
 *   <li>回填 actual_finish_time 和 deviation_minutes</li>
 *   <li>偏差数据将在下次 IntelligenceLearningJob 运行时被纳入样本修正</li>
 * </ol>
 *
 * <p><b>降级：</b>无论持久化是否成功，反馈接叫不报错。
 */
@Service
@Slf4j
public class FeedbackLearningOrchestrator {

    @Autowired
    private IntelligencePredictionLogMapper predictionLogMapper;

    @Autowired
    private FeedbackReasonOrchestrator feedbackReasonOrchestrator;

    @Autowired
    private IntelligenceFeedbackRecordMapper feedbackRecordMapper;

    @Autowired
    private AiAdvisorService aiAdvisorService;

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    /**
     * 建议类型采纳统计： suggestionType → [accepted, rejected, total]
     * 用于 ActionCenter 排序权重动态调整
     */
    private final ConcurrentHashMap<String, java.util.concurrent.atomic.AtomicIntegerArray> typeStats = new ConcurrentHashMap<>();

    public FeedbackResponse acceptFeedback(FeedbackRequest request) {
        FeedbackResponse response = new FeedbackResponse();
        response.setAccepted(Boolean.TRUE);

        if (request == null) {
            response.setAccepted(Boolean.FALSE);
            response.setMessage("反馈为空，未记录");
            return response;
        }

        // 偏差计算
        long deviationMinutes = 0;
        if (request.getPredictedFinishTime() != null && request.getActualFinishTime() != null) {
            deviationMinutes = Duration.between(
                    request.getPredictedFinishTime(),
                    request.getActualFinishTime()).toMinutes();
            response.setDeviationMinutes(Math.abs(deviationMinutes));
        }

        // 尝试回填预测日志
        if (StringUtils.hasText(request.getPredictionId())) {
            try {
                int rows = predictionLogMapper.updateFeedback(
                        request.getPredictionId(),
                        request.getActualFinishTime(),
                        deviationMinutes,
                        request.getAcceptedSuggestion(),
                        com.fashion.supplychain.common.UserContext.tenantId());

                if (rows > 0) {
                    log.info("[反馈闭环] predictionId={} 偏差={}分钟 已持久化",
                            request.getPredictionId(), deviationMinutes);
                    response.setMessage(String.format(
                            "反馈已记录。预测偏差 %d 分钟，将在下次每日学习任务运行时入入样本修正模型",
                            Math.abs(deviationMinutes)));
                } else {
                    // predictionId 不存在时，新建一条反馈记录
                    saveOrphanFeedback(request, deviationMinutes);
                    response.setMessage("反馈已记录（预测记录不存在，已新建反馈条目）");
                }
            } catch (Exception e) {
                log.warn("[反馈闭环] 持久化失败（不影响响应）: {}", e.getMessage());
                response.setMessage("反馈已接收，持久化下次重试");
            }
        } else {
            response.setMessage("反馈已接收（未传 predictionId，仅记录偏差）");
            log.debug("[反馈闭环] 未传 predictionId，僅返回偏差计算结果");
        }

        writeFeedbackRecord(request, deviationMinutes);
        try {
            feedbackReasonOrchestrator.recordFeedbackReason(request);
        } catch (Exception e) {
            log.warn("[反馈闭环] 写入feedback_reason失败（不影响响应）: {}", e.getMessage());
        }
        return response;
    }

    // 将反馈写入独立智能反馈记录表，供学习闭环使用
    private void writeFeedbackRecord(FeedbackRequest request, long deviationMinutes) {
        if (!isFeedbackRecordTableReady()) {
            return;
        }
        try {
            UserContext ctx = UserContext.get();
            IntelligenceFeedbackRecord record = new IntelligenceFeedbackRecord();
            record.setTenantId(ctx != null && ctx.getTenantId() != null ? ctx.getTenantId() : 0L);
            record.setPredictionId(truncate(request.getPredictionId(), 100));
            record.setSuggestionType(truncate(request.getSuggestionType(), 100));
            record.setFeedbackResult(Boolean.TRUE.equals(request.getAcceptedSuggestion())
                    ? "accepted" : "rejected");
            record.setFeedbackReason(truncate(request.getReasonText(), 500));
            record.setDeviationMinutes(Math.abs(deviationMinutes));
            record.setCreateTime(LocalDateTime.now());
            record.setUpdateTime(LocalDateTime.now());
            feedbackRecordMapper.insert(record);
            // 更新类型权重统计（供 ActionCenter 动态排序）
            updateTypeStats(request.getSuggestionType(),
                    "accepted".equals(record.getFeedbackResult()));
            // 偏差超过30分钟时触发 AI 反思
            if (aiAdvisorService.isEnabled() && Math.abs(deviationMinutes) > 30) {
                try {
                    String analysis = aiAdvisorService.chat(
                            "你是供应链工序偏差分析专家，分析简洁、精准。",
                            "工序「" + request.getStageName() + "」预测偏差 "
                                + Math.abs(deviationMinutes) + " 分钟（"
                                + (deviationMinutes > 0 ? "实际滞后" : "实际提前") + "）。"
                                + "原因：" + request.getReasonText()
                                + "。请用1句话给出最可能的根本原因和改进方向。");
                    if (analysis != null) {
                        record.setFeedbackAnalysis(analysis.trim());
                        feedbackRecordMapper.updateById(record);
                    }
                } catch (Exception aiEx) {
                    log.debug("[反馈闭环] AI分析失败（忽略）: {}", aiEx.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("[反馈闭环] 写入feedback_record失败（不影响响应）: {}", e.getMessage());
        }
    }

    /**
     * 历史环境中 t_intelligence_feedback 曾被旧版执行引擎占用为另一套表结构。
     * 这里仅在当前学习闭环所需列齐全且 id 为数值主键时才写入，避免运行时持续报 SQL 错。
     */
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
                String idType = jdbcTemplate.queryForObject(
                        "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS "
                                + "WHERE TABLE_SCHEMA = DATABASE() "
                                + "AND TABLE_NAME = 't_intelligence_feedback' "
                                + "AND COLUMN_NAME = 'id'",
                        String.class);
                boolean ready = requiredColumns != null && requiredColumns == 8
                        && idType != null
                        && ("bigint".equalsIgnoreCase(idType) || "int".equalsIgnoreCase(idType));
                feedbackRecordTableReady = ready;
                if (!ready) {
                    log.warn("[反馈闭环] 检测到 t_intelligence_feedback 仍为历史结构，跳过学习闭环写入，避免影响主接口响应");
                }
            } catch (Exception e) {
                log.warn("[反馈闭环] 检测 t_intelligence_feedback 结构失败，按不写入处理: {}", e.getMessage());
                feedbackRecordTableReady = false;
            }
            return feedbackRecordTableReady;
        } finally {
            schemaCheckLock.unlock();
        }
    }

    // 私有：新建此前没有 predictionId 的反馈记录
    private void saveOrphanFeedback(FeedbackRequest request, long deviationMinutes) {
        try {
            UserContext ctx = UserContext.get();
            IntelligencePredictionLog orphan = new IntelligencePredictionLog();
            orphan.setPredictionId(request.getPredictionId());
            orphan.setTenantId(ctx != null ? ctx.getTenantId() : null);
            orphan.setOrderId(request.getOrderId());
            orphan.setOrderNo(request.getOrderNo());
            orphan.setStageName(request.getStageName());
            orphan.setProcessName(request.getProcessName());
            orphan.setPredictedFinishTime(request.getPredictedFinishTime());
            orphan.setActualFinishTime(request.getActualFinishTime());
            orphan.setDeviationMinutes(deviationMinutes);
            orphan.setFeedbackAccepted(request.getAcceptedSuggestion());
            orphan.setAlgorithmVersion("rule_v1");
            predictionLogMapper.insert(orphan);
        } catch (Exception e) {
            log.debug("[反馈闭环] orphan 写入失败: {}", e.getMessage());
        }
    }

    // ── 权重 API ──────────────────────────────────────────────────────

    /**
     * 获取任务类型权重因子（基于历史采纳率，范围 [0.5, 1.5]\uff09
     * <ul>
     *   <li>采纳率 100% → 1.5（该类建议排序提升 50%）</li>
     *   <li>采纳率 50%  → 1.0（中性）</li>
     *   <li>采纳率 0%   → 0.5（该类建议排序降低 50%）</li>
     *   <li>反馈数 &lt; 3 → 1.0（样本不足，不调权重）</li>
     * </ul>
     */
    public double getTaskTypeWeight(String taskType) {
        if (taskType == null) return 1.0;
        java.util.concurrent.atomic.AtomicIntegerArray s = typeStats.get(taskType);
        if (s == null || s.get(2) < 3) return 1.0;
        double acceptRatio = (double) s.get(0) / s.get(2);
        return Math.max(0.5, Math.min(1.5, 0.5 + acceptRatio));
    }

    /** 更新指定类型的采纳/拒绝计数（线程安全） */
    private void updateTypeStats(String type, boolean accepted) {
        if (type == null || type.isBlank()) return;
        java.util.concurrent.atomic.AtomicIntegerArray stats = typeStats.computeIfAbsent(type, k -> new java.util.concurrent.atomic.AtomicIntegerArray(3));
        if (accepted) stats.incrementAndGet(0);
        else stats.incrementAndGet(1);
        stats.incrementAndGet(2);
    }

    private String truncate(String value, int maxLen) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.length() <= maxLen) {
            return trimmed;
        }
        return trimmed.substring(0, maxLen);
    }
}
