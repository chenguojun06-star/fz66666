package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.dto.QualityAiSuggestionResponse;
import com.fashion.supplychain.production.orchestration.QualityAiSuggestionOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * AI质检建议接口
 */
@RestController
@RequestMapping("/api/quality")
@PreAuthorize("isAuthenticated()")
@Slf4j
public class QualityAiSuggestionController {

    @Autowired
    private QualityAiSuggestionOrchestrator qualityAiSuggestionOrchestrator;

    /**
     * 获取AI质检建议
     * GET /api/quality/ai-suggestion?orderId=xxx
     *
     * 返回：质检要点列表 + 按异常类别的AI建议 + 历史次品率
     * 不传 orderId 时返回通用质检要点（用于品类未知场景）
     */
    @GetMapping("/ai-suggestion")
    public Result<QualityAiSuggestionResponse> getAiSuggestion(
            @RequestParam(required = false) String orderId) {
        try {
            QualityAiSuggestionResponse result = qualityAiSuggestionOrchestrator.getSuggestion(orderId);
            return Result.success(result);
        } catch (Exception e) {
            log.error("[QualityAI] 获取AI建议失败: orderId={}", orderId, e);
            return Result.fail("获取AI建议失败，请稍后重试");
        }
    }
}
