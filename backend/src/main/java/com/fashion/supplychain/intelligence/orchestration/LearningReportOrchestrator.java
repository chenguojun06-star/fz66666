package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.LearningReportResponse;
import com.fashion.supplychain.intelligence.dto.LearningReportResponse.StageLearningStat;
import com.fashion.supplychain.intelligence.entity.IntelligenceProcessStats;
import com.fashion.supplychain.intelligence.mapper.IntelligencePredictionLogMapper;
import com.fashion.supplychain.intelligence.mapper.IntelligenceProcessStatsMapper;
import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * AI 学习报告编排器
 *
 * <p>汇总展示当前租户的智能学习状态：
 * 样本数、置信度、各工序学习进度、预测准确率趋势。
 */
@Service
@Slf4j
public class LearningReportOrchestrator {

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    @Autowired
    private IntelligenceProcessStatsMapper statsMapper;

    @Autowired
    private IntelligencePredictionLogMapper predictionLogMapper;

    public LearningReportResponse getReport() {
        Long tenantId = UserContext.tenantId();
        LearningReportResponse response = new LearningReportResponse();

        // 读取所有工序统计
        LambdaQueryWrapper<IntelligenceProcessStats> qw = new LambdaQueryWrapper<>();
        qw.eq(tenantId != null, IntelligenceProcessStats::getTenantId, tenantId)
          .orderByDesc(IntelligenceProcessStats::getSampleCount);

        List<IntelligenceProcessStats> statsList = statsMapper.selectList(qw);

        long totalSamples = 0;
        double sumConfidence = 0;
        String lastLearnTime = null;

        List<StageLearningStat> stages = new ArrayList<>();
        for (IntelligenceProcessStats stats : statsList) {
            StageLearningStat item = new StageLearningStat();
            item.setStageName(stats.getStageName());
            item.setSampleCount(stats.getSampleCount() != null ? stats.getSampleCount() : 0);
            item.setConfidence(stats.getConfidenceScore() != null
                    ? stats.getConfidenceScore().doubleValue() : 0);
            item.setAvgMinutesPerUnit(stats.getAvgMinutesPerUnit() != null
                    ? stats.getAvgMinutesPerUnit().doubleValue() : 0);
            stages.add(item);

            totalSamples += item.getSampleCount();
            sumConfidence += item.getConfidence();

            if (stats.getLastComputedTime() != null) {
                String formatted = stats.getLastComputedTime().format(DT_FMT);
                if (lastLearnTime == null || formatted.compareTo(lastLearnTime) > 0) {
                    lastLearnTime = formatted;
                }
            }
        }

        // 按样本数降序
        stages.sort(Comparator.comparingInt(StageLearningStat::getSampleCount).reversed());

        response.setTotalSamples(totalSamples);
        response.setStageCount(stages.size());
        response.setAvgConfidence(stages.isEmpty() ? 0
                : Math.round(sumConfidence / stages.size() * 100.0) / 100.0);
        response.setStages(stages);
        response.setLastLearnTime(lastLearnTime);

        // 预测日志统计
        try {
            Long feedbackCount = predictionLogMapper.selectCount(
                    new LambdaQueryWrapper<com.fashion.supplychain.intelligence.entity.IntelligencePredictionLog>()
                            .eq(tenantId != null,
                                    com.fashion.supplychain.intelligence.entity.IntelligencePredictionLog::getTenantId,
                                    tenantId));
            response.setFeedbackCount(feedbackCount != null ? feedbackCount : 0);
        } catch (Exception e) {
            log.warn("[学习报告] 查询预测日志数失败: {}", e.getMessage());
        }

        return response;
    }
}
