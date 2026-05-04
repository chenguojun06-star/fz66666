package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.RateLimitUtil;
import com.fashion.supplychain.intelligence.agent.AgentMode;
import com.fashion.supplychain.intelligence.annotation.DataTruth;
import com.fashion.supplychain.intelligence.dto.*;
import com.fashion.supplychain.intelligence.orchestration.*;
import com.fashion.supplychain.intelligence.service.AiAgentMetricsService;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * AI 顾问端点 — 对话/流式/文件分析/信号/记忆/学习闭环/预测/沙盘
 */
@Slf4j
@RestController
@RequestMapping("/api/intelligence")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class IntelligenceAiAdvisorController {

    @Value("${app.sse.timeout:300000}")
    private long sseTimeout;

    @Value("${app.upload.max-size:5242880}")
    private long uploadMaxSize;

    private final StringRedisTemplate stringRedisTemplate;
    private final AiAgentOrchestrator aiAgentOrchestrator;
    private final AiAdvisorChatResponseOrchestrator aiAdvisorChatResponseOrchestrator;
    private final AiAdvisorService aiAdvisorService;
    private final AiAgentMetricsService aiAgentMetricsService;
    private final IntelligenceBrainOrchestrator intelligenceBrainOrchestrator;
    private final SafeAdvisorOrchestrator safeAdvisorOrchestrator;
    private final ForecastEngineOrchestrator forecastEngineOrchestrator;
    private final SalesForecastOrchestrator salesForecastOrchestrator;
    private final WhatIfSimulationOrchestrator whatIfSimulationOrchestrator;
    private final VisualAIOrchestrator visualAIOrchestrator;
    private final CrossTenantBenchmarkOrchestrator crossTenantBenchmarkOrchestrator;
    private final VoiceCommandOrchestrator voiceCommandOrchestrator;
    private final IntelligenceSignalOrchestrator intelligenceSignalOrchestrator;
    private final IntelligenceMemoryOrchestrator intelligenceMemoryOrchestrator;
    private final LearningLoopOrchestrator learningLoopOrchestrator;

    @Autowired
    private com.fashion.supplychain.intelligence.orchestration.FileAnalysisOrchestrator fileAnalysisOrchestrator;

    @Autowired
    private com.fashion.supplychain.intelligence.mapper.IntelligenceMetricsMapper intelligenceMetricsMapper;

    @GetMapping("/ai-advisor/status")
    public Result<?> aiAdvisorStatus() {
        boolean enabled = aiAdvisorService.isEnabled();
        return Result.success(java.util.Map.of(
                "enabled", enabled,
                "message", enabled ? "AI 顾问已启用" : "AI 顾问未配置，请设置模型直连或模型网关配置",
                "modelGateway", intelligenceBrainOrchestrator.snapshot().getModelGateway(),
                "observability", intelligenceBrainOrchestrator.snapshot().getObservability()
        ));
    }

    @GetMapping("/ai-agent/metrics")
    public Result<?> aiAgentMetrics() {
        return Result.success(aiAgentMetricsService.getSnapshot());
    }

    /** AI 顾问问答 — 优先本地规则引擎，无法回答时调用 DeepSeek */
    @PostMapping("/ai-advisor/chat")
    public Result<AiAdvisorChatResponse> aiAdvisorChat(
            @RequestBody java.util.Map<String, String> body,
            jakarta.servlet.http.HttpServletRequest request) {
        String userId = UserContext.userId();
        if (!RateLimitUtil.checkRateLimit(stringRedisTemplate, "rl:ai:chat:" + userId, 30, 1)) {
            return Result.fail("AI对话请求过于频繁，请稍后再试");
        }
        String question = body.getOrDefault("question", "");
        if (question == null || question.isBlank()) {
            return Result.fail("问题不能为空");
        }
        String pageContext = body.get("pageContext");
        String conversationId = body.get("conversationId");
        AgentMode agentMode = AgentMode.fromString(body.get("mode"));
        Result<String> agentResult = aiAgentOrchestrator.executeAgent(question, pageContext, agentMode);
        String commandId = aiAgentOrchestrator.consumeLastCommandId();
        var toolRecords = aiAgentOrchestrator.consumeLastToolRecords();
        AiAdvisorChatResponse resp = aiAdvisorChatResponseOrchestrator.build(question, commandId, agentResult, toolRecords);
        if (conversationId != null) { resp.setConversationId(conversationId); }
        return Result.success(resp);
    }

    /** AI 顾问流式问答 — SSE 实时推送思考/工具调用/回答事件 */
    @PreAuthorize("permitAll()")
    @GetMapping(value = "/ai-advisor/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter aiAdvisorChatStream(@RequestParam String question,
                                          @RequestParam(required = false) String pageContext,
                                          @RequestParam(required = false) String conversationId,
                                          @RequestParam(required = false) String imageUrl,
                                          @RequestParam(required = false) String orderNo,
                                          @RequestParam(required = false) String processName,
                                          @RequestParam(required = false) String stage,
                                          @RequestParam(required = false) String mode,
                                          jakarta.servlet.http.HttpServletResponse response) {
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        // 前置鉴权：必须在 SseEmitter 创建（响应头提交）之前完成 Token 校验。
        // 若 UserContext 未填充（Token 过期/无效），此时响应头尚未发出，Spring Security
        // 能正常返回 401，避免 "response is already committed" 异常。
        String userId = UserContext.userId();
        if (userId == null || userId.isBlank()) {
            throw new org.springframework.security.access.AccessDeniedException("登录已过期，请重新登录");
        }
        if (!RateLimitUtil.checkRateLimit(stringRedisTemplate, "rl:ai:sse:" + userId, 30, 1)) {
            SseEmitter emitter = new SseEmitter(3000L);
            try { emitter.send(SseEmitter.event().name("error").data("AI对话请求过于频繁")); emitter.complete(); } catch (Exception e) { log.warn("[AI对话] SSE限流提示发送失败: userId={}", userId); }
            return emitter;
        }
        SseEmitter emitter = new SseEmitter(sseTimeout);
        if (question == null || question.isBlank()) {
            try {
                emitter.send(SseEmitter.event().name("error").data("{\"message\":\"问题不能为空\"}"));
                emitter.complete();
            } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
            return emitter;
        }
        UserContext currentCtx = UserContext.get();
        UserContext snapshot = new UserContext();
        if (currentCtx != null) {
            snapshot.setTenantId(currentCtx.getTenantId());
            snapshot.setUserId(currentCtx.getUserId());
            snapshot.setUsername(currentCtx.getUsername());
            snapshot.setRole(currentCtx.getRole());
            snapshot.setSuperAdmin(currentCtx.getSuperAdmin());
            snapshot.setTenantOwner(currentCtx.getTenantOwner());
            snapshot.setFactoryId(currentCtx.getFactoryId());
        }
        Thread.startVirtualThread(() -> {
            try {
                UserContext.set(snapshot);
                aiAgentOrchestrator.executeAgentStreaming(question, pageContext, AgentMode.fromString(mode), emitter);
            } catch (Exception e) {
                try {
                    emitter.send(SseEmitter.event().name("error").data("{\"message\":\"" + e.getMessage() + "\"}"));
                    emitter.complete();
                } catch (Exception ex) { log.debug("Non-critical error: {}", ex.getMessage()); }
            } finally {
                UserContext.clear();
            }
        });
        return emitter;
    }

    /** 文件上传分析 — 解析 Excel/CSV 内容，返回 Markdown 表格供 AI 分析 */
    @PostMapping(value = "/ai-advisor/upload-analyze", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public Result<java.util.Map<String, String>> uploadAndAnalyze(
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        if (file == null || file.isEmpty()) { return Result.fail("请选择要上传的文件"); }
        if (file.getSize() > uploadMaxSize) { return Result.fail("文件大小不能超过 5MB"); }
        String parsedContent = fileAnalysisOrchestrator.analyzeFile(file);
        String safeFilename = java.util.Objects.requireNonNullElse(file.getOriginalFilename(), "unknown");
        return Result.success(java.util.Map.of("filename", safeFilename, "parsedContent", parsedContent));
    }

    /** AI 回答用户反馈（RLHF 数据采集） */
    @PostMapping("/ai-feedback")
    public Result<Void> submitAiFeedback(@RequestBody java.util.Map<String, Object> body) {
        String commandId = body.get("commandId") == null ? null : body.get("commandId").toString();
        if (commandId == null || commandId.isBlank()) { return Result.fail("commandId 不能为空"); }
        int score = 0;
        try { score = Integer.parseInt(String.valueOf(body.getOrDefault("score", 0))); } catch (Exception e) { log.warn("[AI反馈] score解析失败: {}", e.getMessage()); }
        String comment = body.get("comment") == null ? null : body.get("comment").toString();
        com.fashion.supplychain.intelligence.entity.IntelligenceMetrics m =
                new com.fashion.supplychain.intelligence.entity.IntelligenceMetrics();
        m.setCommandId(commandId);
        m.setFeedbackScore(score);
        m.setUserFeedback(comment);
        intelligenceMetricsMapper.update(m,
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.fashion.supplychain.intelligence.entity.IntelligenceMetrics>()
                        .eq("command_id", commandId));
        log.info("[AiFeedback] commandId={} score={} comment={}", commandId, score, comment);
        return Result.success(null);
    }

    /** 场景化工作流 */
    @PostMapping("/ai-advisor/scenario/{key}")
    public Result<AiAdvisorChatResponse> scenarioWorkflow(
            @PathVariable String key,
            @RequestBody(required = false) java.util.Map<String, String> body) {
        String prompt;
        switch (key) {
            case "morning_brief": prompt = "请用今日运营晨报的结构回答：昨日入库/扫码/工资数据，今日待关注订单与高风险订单，并给出3条经营建议。"; break;
            case "month_close": prompt = "请按月末结算检查：本月工资结算是否完整、对账单待审批项、异常工资记录，并列出今日优先处理动作。"; break;
            case "quality_review": prompt = "请汇总本周质检不良率 Top5 订单、主要不良类型、涉及工厂，并给出改进建议。"; break;
            case "delay_scan": prompt = "请列出最高风险的5个订单（进度<50% 且距离出货≤7天），给出每单补救建议。"; break;
            case "order_compare": { String orderNo = body == null ? null : body.get("orderNo"); prompt = orderNo == null ? "请调用 tool_order_comparison 做异常订单对比分析。" : "请调用 tool_order_comparison 对比订单 " + orderNo + " 与同款正常订单，分析偏差。"; break; }
            case "capacity_radar": prompt = "请汇总各工厂产能雷达：订单数/件数/高风险/逾期，按风险等级排序。"; break;
            default: return Result.fail("未知场景：" + key);
        }
        Result<String> agentResult = aiAgentOrchestrator.executeAgent(prompt);
        String commandId = aiAgentOrchestrator.consumeLastCommandId();
        var toolRecords = aiAgentOrchestrator.consumeLastToolRecords();
        return Result.success(aiAdvisorChatResponseOrchestrator.build(prompt, commandId, agentResult, toolRecords));
    }

    @PostMapping("/ai-advisor/conversation/persist")
    public Result<Void> persistAiConversation() {
        aiAgentOrchestrator.saveCurrentConversationToMemory();
        return Result.success(null);
    }

    /** @deprecated 使用 POST /ai-advisor/conversation/persist 替代 */
    @Deprecated
    @PostMapping("/ai-advisor/memory/save")
    public Result<Void> saveAiConversationMemory() {
        aiAgentOrchestrator.saveCurrentConversationToMemory();
        return Result.success(null);
    }

    /** SafeAdvisor — RAG 增强问答 */
    @PostMapping("/safe-advisor/analyze")
    public Result<?> safeAdvisorAnalyze(@RequestBody java.util.Map<String, String> body) {
        String question = body.getOrDefault("question", "");
        if (question == null || question.isBlank()) { return Result.fail("问题不能为空"); }
        Result<String> result = safeAdvisorOrchestrator.analyzeAndSuggest(question);
        if (!Integer.valueOf(200).equals(result.getCode())) {
            return Result.success(java.util.Map.of("answer", result.getMessage(), "source", "error"));
        }
        return Result.success(java.util.Map.of("answer", result.getData(), "source", "safe-advisor"));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/forecast")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "预测由AI模型生成")
    public Result<ForecastEngineResponse> forecast(@RequestBody ForecastEngineRequest req) {
        return Result.success(forecastEngineOrchestrator.forecast(req));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/sales-forecast")
    public Result<SalesForecastOrchestrator.SalesForecastResponse> salesForecast(
            @RequestParam String styleNo, @RequestParam(defaultValue = "1") int horizonMonths) {
        return Result.success(salesForecastOrchestrator.forecastSales(styleNo, horizonMonths));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/size-curve")
    public Result<SalesForecastOrchestrator.SizeCurveResponse> sizeCurve(@RequestParam String styleNo) {
        return Result.success(salesForecastOrchestrator.forecastSizeCurve(styleNo));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/whatif/simulate")
    @DataTruth(source = DataTruth.Source.SIMULATED, description = "What-If推演为模拟数据")
    public Result<WhatIfResponse> whatIfSimulate(@RequestBody WhatIfRequest req) {
        return Result.success(whatIfSimulationOrchestrator.simulate(req));
    }

    @PostMapping("/visual/analyze")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "视觉AI分析由LLM生成")
    public Result<VisualAIResponse> visualAnalyze(@RequestBody VisualAIRequest req) {
        return Result.success(visualAIOrchestrator.analyze(req));
    }

    @GetMapping("/benchmark/performance")
    public Result<CrossTenantBenchmarkResponse> benchmarkPerformance() {
        return Result.success(crossTenantBenchmarkOrchestrator.getBenchmark());
    }

    @PostMapping("/voice/command")
    public Result<VoiceCommandResponse> voiceCommand(@RequestBody VoiceCommandRequest req) {
        return Result.success(voiceCommandOrchestrator.processVoice(req));
    }

    @PostMapping("/signal/collect")
    public Result<IntelligenceSignalResponse> collectSignals() {
        return Result.success(intelligenceSignalOrchestrator.collectAndAnalyze());
    }

    @GetMapping("/signal/open")
    public Result<java.util.List<com.fashion.supplychain.intelligence.entity.IntelligenceSignal>>
            openSignals(@RequestParam(defaultValue = "70") int minPriority) {
        return Result.success(intelligenceSignalOrchestrator.getOpenSignals(UserContext.tenantId(), minPriority));
    }

    @PostMapping("/signal/{signalId}/resolve")
    public Result<Void> resolveSignal(@PathVariable Long signalId) {
        intelligenceSignalOrchestrator.resolveSignal(signalId, UserContext.tenantId());
        return Result.success();
    }

    @PostMapping("/memory")
    public Result<IntelligenceMemoryResponse> createMemory(@RequestBody java.util.Map<String, String> body) {
        return Result.success(intelligenceMemoryOrchestrator.saveCase(
                body.get("memoryType"), body.get("businessDomain"), body.get("title"), body.get("content")));
    }

    /** @deprecated 使用 POST /memory 替代 */
    @Deprecated
    @PostMapping("/memory/save")
    public Result<IntelligenceMemoryResponse> saveMemory(@RequestBody java.util.Map<String, String> body) {
        return Result.success(intelligenceMemoryOrchestrator.saveCase(
                body.get("memoryType"), body.get("businessDomain"), body.get("title"), body.get("content")));
    }

    @GetMapping("/memory/recall")
    public Result<IntelligenceMemoryResponse> recallMemory(
            @RequestParam String query, @RequestParam(defaultValue = "5") int topK) {
        return Result.success(intelligenceMemoryOrchestrator.recallSimilar(UserContext.tenantId(), query, topK));
    }

    @PostMapping("/memory/{memoryId}/adopted")
    public Result<Void> markAdopted(@PathVariable Long memoryId) {
        intelligenceMemoryOrchestrator.markAdopted(memoryId);
        return Result.success();
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/learning/loop")
    public Result<LearningLoopResponse> runLearningLoop() {
        return Result.success(learningLoopOrchestrator.runLoop());
    }
}
