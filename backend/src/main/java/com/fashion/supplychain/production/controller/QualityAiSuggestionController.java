package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.intelligence.dto.VisualAIRequest;
import com.fashion.supplychain.intelligence.dto.VisualAIResponse;
import com.fashion.supplychain.intelligence.orchestration.VisualAIOrchestrator;
import com.fashion.supplychain.intelligence.service.VisionAnalysisService;
import com.fashion.supplychain.production.dto.QualityAiSuggestionResponse;
import com.fashion.supplychain.production.orchestration.QualityAiSuggestionOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

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

    @Autowired
    private VisualAIOrchestrator visualAIOrchestrator;

    @Autowired
    private VisionAnalysisService visionAnalysisService;

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

    /**
     * 质检图片AI缺陷检测
     * POST /api/quality/ai-defect-detect
     *
     * 传入质检图片URL，自动分析图片中的缺陷（破洞/污渍/色差/线头等）
     * 用于质检扫码时上传图片后自动调用，辅助质检员判断
     *
     * 请求体：{"imageUrl": "xxx", "contextHint": "可选上下文"}
     */
    @PostMapping("/ai-defect-detect")
    public Result<VisualAIResponse> detectDefects(@RequestBody Map<String, Object> params) {
        try {
            String imageUrl = TextUtils.safeText(params.get("imageUrl"));
            if (TextUtils.isEmpty(imageUrl)) {
                return Result.fail("图片URL不能为空");
            }

            if (!visionAnalysisService.isAvailable()) {
                return Result.fail("视觉AI未配置，暂无法使用图片分析功能");
            }

            VisualAIRequest req = new VisualAIRequest();
            req.setImageUrl(imageUrl);
            req.setTaskType("DEFECT_DETECT");

            VisualAIResponse result = visualAIOrchestrator.analyze(req);
            return Result.success(result);
        } catch (Exception e) {
            log.error("[QualityAI] 图片缺陷检测失败: imageUrl={}",
                    params != null ? params.get("imageUrl") : "null", e);
            return Result.fail("图片分析失败，请稍后重试");
        }
    }
}
