package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.service.DeliveryPredictionService;
import com.fashion.supplychain.intelligence.service.RestockSuggestionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 预测类智能能力编排层（交期风险 + 补货建议）
 *
 * <p>{@code IntelligencePredictionController} 原先直接注入 {@code DeliveryPredictionService} +
 * {@code RestockSuggestionService}（D-630 规则6 违规），现由本层承接。
 * 租户上下文（{@code UserContext.tenantId()}）在编排层读取，保证「按租户隔离」不被绕过。
 */
@Service
public class IntelligencePredictionOrchestrator {

    @Autowired
    private DeliveryPredictionService deliveryService;

    @Autowired
    private RestockSuggestionService restockService;

    /** 交期风险预测 TopN。 */
    public Result<?> getDeliveryRisks(int topN) {
        return Result.success(deliveryService.predictRisks(UserContext.tenantId(), topN));
    }

    /** 补货建议 TopN。 */
    public Result<?> getRestockSuggestions(int topN) {
        return Result.success(restockService.getSuggestions(UserContext.tenantId(), topN));
    }
}
