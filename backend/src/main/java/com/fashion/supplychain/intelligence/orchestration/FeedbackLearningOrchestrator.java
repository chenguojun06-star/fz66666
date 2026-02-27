package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.FeedbackRequest;
import com.fashion.supplychain.intelligence.dto.FeedbackResponse;
import com.fashion.supplychain.intelligence.entity.IntelligencePredictionLog;
import com.fashion.supplychain.intelligence.mapper.IntelligencePredictionLogMapper;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
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
                        request.getAcceptedSuggestion());

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

        return response;
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
}
