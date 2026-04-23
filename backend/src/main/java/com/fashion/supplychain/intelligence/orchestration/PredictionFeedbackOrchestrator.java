package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.entity.IntelligencePredictionLog;
import com.fashion.supplychain.intelligence.mapper.IntelligencePredictionLogMapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class PredictionFeedbackOrchestrator {

    @Autowired
    private IntelligencePredictionLogMapper predictionLogMapper;

    public void backfillOnOrderComplete(ProductionOrder order) {
        if (order == null || order.getActualEndDate() == null || order.getId() == null) return;

        try {
            List<IntelligencePredictionLog> logs = predictionLogMapper.selectList(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<IntelligencePredictionLog>()
                            .eq("order_id", order.getId())
                            .isNull("actual_finish_time")
                            .isNotNull("predicted_finish_time")
                            .orderByDesc("create_time")
                            .last("LIMIT 10"));

            for (IntelligencePredictionLog log : logs) {
                log.setActualFinishTime(order.getActualEndDate());
                long devMin = ChronoUnit.MINUTES.between(log.getPredictedFinishTime(), order.getActualEndDate());
                log.setDeviationMinutes(devMin);
                log.setFeedbackAccepted(true);
                predictionLogMapper.updateById(log);
            }

            if (!logs.isEmpty()) {
                log.info("[预测反馈] 订单{}完成，回填{}条预测记录", order.getOrderNo(), logs.size());
            }
        } catch (Exception e) {
            log.warn("[预测反馈] 回填失败: orderId={}, error={}", order.getId(), e.getMessage());
        }
    }
}
