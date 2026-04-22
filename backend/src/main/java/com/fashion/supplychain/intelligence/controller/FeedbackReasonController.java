package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.orchestration.FeedbackReasonOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ProcessRewardOrchestrator;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/intelligence/feedback-reason")
@PreAuthorize("isAuthenticated()")
public class FeedbackReasonController {

    @Autowired
    private FeedbackReasonOrchestrator feedbackReasonOrchestrator;

    @Autowired
    private ProcessRewardOrchestrator processRewardOrchestrator;

    @GetMapping("/list")
    public Result<?> list(@RequestParam(defaultValue = "20") int limit) {
        return Result.success(feedbackReasonOrchestrator.listCurrentTenantFeedbackReasons(limit));
    }

    /**
     * P0: 用户对 AI 小云对话消息的显式反馈（👍/👎）。
     * score: 1=有帮助(PRM +2)，-1=无帮助(PRM -2)。
     * 直接写入 ai_process_reward 表，用于工具选择自适应权重计算。
     */
    @PostMapping("/ai-message-feedback")
    public Result<?> submitAiMessageFeedback(@RequestBody AiMessageFeedbackRequest req) {
        if (req == null || req.getScore() == null) return Result.fail("参数缺失");
        int prmScore = req.getScore() > 0 ? 2 : -2;
        String outcome = req.getScore() > 0 ? "ACCEPTED" : "REJECTED";
        processRewardOrchestrator.record(
            req.getSessionId(),
            null,
            null,
            "ai_chat_response",
            req.getUserQuery() != null ? req.getUserQuery() : "",
            req.getAiContent() != null && req.getAiContent().length() > 200
                ? req.getAiContent().substring(0, 200) : req.getAiContent(),
            prmScore,
            req.getScore() > 0 ? "用户明确点赞" : "用户明确点踩",
            "USER_EXPLICIT",
            outcome,
            null,
            null,
            "chat_feedback"
        );
        return Result.success();
    }

    /** AI 消息反馈请求体 */
    @Data
    public static class AiMessageFeedbackRequest {
        private String sessionId;
        private String commandId;
        /** 1=有帮助，-1=无帮助 */
        private Integer score;
        private String userQuery;
        private String aiContent;
        private String feedbackText;
    }
}
