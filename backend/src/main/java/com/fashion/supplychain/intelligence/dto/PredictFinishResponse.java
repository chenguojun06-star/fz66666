package com.fashion.supplychain.intelligence.dto;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.Data;

/**
 * 预测完成时间响应 DTO
 *
 * <p>前端展示建议：<br>
 * - {@code predictedFinishTime}：进度球/进度条 hover 提示"预计完成：XX月XX日"<br>
 * - {@code confidence}：0.30=仅供参考，≥0.75=较高置信度<br>
 * - {@code remainingQuantity}：与进度球展示的剩余件数保持一致（同源）
 */
@Data
public class PredictFinishResponse {
    private LocalDateTime predictedFinishTime;
    private Double confidence;
    private List<String> reasons = new ArrayList<>();
    private List<String> suggestions = new ArrayList<>();
    private String predictionId;

    // ── 数量明细（与进度球数据同源，便于前端一致性校验）──
    /** 订单总件数（cuttingQuantity 或 orderQuantity） */
    private Integer totalQuantity;
    /** 该工序已扫码完成件数 */
    private Integer doneQuantity;
    /** 剩余件数（预测计算基准） */
    private Integer remainingQuantity;
}
