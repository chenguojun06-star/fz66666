package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.FeedbackReasonResponse;
import com.fashion.supplychain.intelligence.dto.FeedbackRequest;
import com.fashion.supplychain.intelligence.entity.IntelligenceFeedbackReason;
import com.fashion.supplychain.intelligence.service.IntelligenceFeedbackReasonService;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class FeedbackReasonOrchestrator {

    @Autowired
    private IntelligenceFeedbackReasonService intelligenceFeedbackReasonService;

    public void recordFeedbackReason(FeedbackRequest request) {
        if (request == null) {
            return;
        }
        if (request.getAcceptedSuggestion() == null
                && !StringUtils.hasText(request.getReasonCode())
                && !StringUtils.hasText(request.getReasonText())) {
            return;
        }
        UserContext ctx = UserContext.get();
        IntelligenceFeedbackReason entity = new IntelligenceFeedbackReason();
        entity.setTenantId(ctx == null ? null : ctx.getTenantId());
        entity.setPredictionId(request.getPredictionId());
        entity.setSuggestionType(normalizeSuggestionType(request.getSuggestionType()));
        entity.setAccepted(request.getAcceptedSuggestion());
        entity.setReasonCode(trimToNull(request.getReasonCode()));
        entity.setReasonText(trimToNull(request.getReasonText()));
        entity.setOrderId(request.getOrderId());
        entity.setOrderNo(request.getOrderNo());
        entity.setStageName(request.getStageName());
        entity.setProcessName(request.getProcessName());
        entity.setOperatorId(ctx == null ? null : ctx.getUserId());
        entity.setOperatorName(ctx == null ? null : ctx.getUsername());
        entity.setCreateTime(LocalDateTime.now());
        entity.setUpdateTime(LocalDateTime.now());
        intelligenceFeedbackReasonService.save(entity);
    }

    public List<FeedbackReasonResponse> listCurrentTenantFeedbackReasons(int limit) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        int size = limit <= 0 ? 20 : Math.min(limit, 100);
        return intelligenceFeedbackReasonService.list(new LambdaQueryWrapper<IntelligenceFeedbackReason>()
                        .eq(IntelligenceFeedbackReason::getTenantId, tenantId)
                        .orderByDesc(IntelligenceFeedbackReason::getCreateTime)
                        .last("LIMIT " + size))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    private FeedbackReasonResponse toResponse(IntelligenceFeedbackReason entity) {
        FeedbackReasonResponse response = new FeedbackReasonResponse();
        response.setId(entity.getId());
        response.setPredictionId(entity.getPredictionId());
        response.setSuggestionType(entity.getSuggestionType());
        response.setAccepted(entity.getAccepted());
        response.setReasonCode(entity.getReasonCode());
        response.setReasonText(entity.getReasonText());
        response.setOrderNo(entity.getOrderNo());
        response.setStageName(entity.getStageName());
        response.setProcessName(entity.getProcessName());
        response.setOperatorName(entity.getOperatorName());
        response.setCreateTime(entity.getCreateTime());
        return response;
    }

    private String normalizeSuggestionType(String suggestionType) {
        String value = trimToNull(suggestionType);
        return value == null ? "GENERAL" : value.toUpperCase();
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }
}
