package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.IntelligencePredictionLog;
import java.time.LocalDateTime;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 预测日志 Mapper
 */
@Mapper
public interface IntelligencePredictionLogMapper extends BaseMapper<IntelligencePredictionLog> {

    /** 根据预测ID查询记录（用于反馈回填） */
    @Select("SELECT * FROM t_intelligence_prediction_log WHERE prediction_id = #{predictionId} LIMIT 1")
    IntelligencePredictionLog findByPredictionId(@Param("predictionId") String predictionId);

    /**
     * 用户反馈回填：更新实际完成时间、偏差分钟数、是否接受建议
     *
     * @return 更新行数（0表示predictionId不存在）
     */
    @Update("UPDATE t_intelligence_prediction_log "
            + "SET actual_finish_time = #{actualFinishTime}, "
            + "    deviation_minutes  = #{deviationMinutes}, "
            + "    feedback_accepted  = #{feedbackAccepted}, "
            + "    update_time        = NOW() "
            + "WHERE prediction_id = #{predictionId}")
    int updateFeedback(
            @Param("predictionId")     String predictionId,
            @Param("actualFinishTime") LocalDateTime actualFinishTime,
            @Param("deviationMinutes") Long deviationMinutes,
            @Param("feedbackAccepted") Boolean feedbackAccepted);

    /**
     * 订单完成时自动回填实际完成时间（数据飞轮自动闭环）
     *
     * <p>只更新 {@code actual_finish_time IS NULL} 的行，避免覆盖用户手动提交的反馈。
     * {@code deviation_minutes} 由 MySQL TIMESTAMPDIFF 自动计算，不依赖 Java 层时区。
     *
     * @param orderId    生产订单ID
     * @param finishTime 实际完成时间（订单关闭时的 LocalDateTime.now()）
     * @return 更新行数
     */
    @Update("UPDATE t_intelligence_prediction_log "
            + "SET actual_finish_time = #{finishTime}, "
            + "    deviation_minutes  = TIMESTAMPDIFF(MINUTE, predicted_finish_time, #{finishTime}), "
            + "    update_time        = NOW() "
            + "WHERE order_id = #{orderId} "
            + "  AND actual_finish_time IS NULL")
    int backfillByOrderId(
            @Param("orderId")     String orderId,
            @Param("finishTime")  LocalDateTime finishTime);
}
