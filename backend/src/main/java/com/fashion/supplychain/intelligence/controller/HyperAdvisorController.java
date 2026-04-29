package com.fashion.supplychain.intelligence.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.HyperAdvisorResponse;
import com.fashion.supplychain.intelligence.entity.HyperAdvisorSession;
import com.fashion.supplychain.intelligence.mapper.HyperAdvisorSessionMapper;
import com.fashion.supplychain.intelligence.orchestration.AdvisorKnowledgeHarvestOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.HyperAdvisorOrchestrator;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * 超级 AI 业务顾问 — 独立控制器
 */
@RestController
@RequestMapping("/api/hyper-advisor")
@PreAuthorize("isAuthenticated()")
public class HyperAdvisorController {

    @Autowired
    private HyperAdvisorOrchestrator hyperAdvisorOrchestrator;

    @Autowired
    private AdvisorKnowledgeHarvestOrchestrator knowledgeHarvestOrchestrator;

    @Autowired
    private HyperAdvisorSessionMapper sessionMapper;

    /**
     * POST /api/hyper-advisor/ask
     * 主对话接口：用户提问 → AI 分析 + 风险量化 + 模拟
     */
    @PostMapping("/ask")
    public Result<HyperAdvisorResponse> ask(@RequestBody Map<String, String> body) {
        String sessionId = body.get("sessionId");
        String userMessage = body.get("userMessage");
        if (userMessage == null || userMessage.isBlank()) {
            return Result.fail("提问内容不能为空");
        }
        HyperAdvisorResponse resp = hyperAdvisorOrchestrator.ask(sessionId, userMessage);
        return Result.success(resp);
    }

    /**
     * POST /api/hyper-advisor/feedback
     * 用户对 AI 回答评分 → 高分自动提炼知识
     */
    @PostMapping("/feedback")
    public Result<Void> feedback(@RequestBody Map<String, Object> body) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        String sessionId = (String) body.get("sessionId");
        String traceId = (String) body.get("traceId");
        String query = (String) body.get("query");
        String advice = (String) body.get("advice");
        int score = body.get("score") != null ? ((Number) body.get("score")).intValue() : 0;
        String feedbackText = (String) body.get("feedbackText");

        knowledgeHarvestOrchestrator.recordFeedback(
                tenantId, userId, sessionId, traceId, query, advice, score, feedbackText);
        return Result.success(null);
    }

    /**
     * GET /api/hyper-advisor/history/{sessionId}
     * 获取指定会话的消息列表
     */
    @GetMapping("/history/{sessionId}")
    public Result<List<HyperAdvisorSession>> history(@PathVariable String sessionId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<HyperAdvisorSession> messages = sessionMapper.selectList(
                new LambdaQueryWrapper<HyperAdvisorSession>()
                        .eq(HyperAdvisorSession::getTenantId, tenantId)
                        .eq(HyperAdvisorSession::getSessionId, sessionId)
                        .eq(HyperAdvisorSession::getDeleteFlag, 0)
                        .orderByAsc(HyperAdvisorSession::getCreateTime));
        return Result.success(messages);
    }
}
