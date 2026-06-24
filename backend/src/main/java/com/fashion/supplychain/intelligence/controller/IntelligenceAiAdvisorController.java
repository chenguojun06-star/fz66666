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
import com.fashion.supplychain.intelligence.service.ProactiveInsightService;
import com.fashion.supplychain.intelligence.service.VisionAnalysisService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

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

    // 诊断用：Agnes/DeepSeek 配置读取
    @Value("${ai.agnes.api-key:}")
    private String agnesApiKey;

    @Value("${ai.agnes.model:agnes-2.0-flash}")
    private String agnesModel;

    @Value("${ai.deepseek.api-key:}")
    private String deepseekApiKey;

    @Value("${ai.deepseek.model:deepseek-v4-flash}")
    private String deepseekModel;

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
    private com.fashion.supplychain.intelligence.service.QdrantService qdrantService;

    @Autowired
    private com.fashion.supplychain.intelligence.orchestration.IntelligenceMetricsOrchestrator intelligenceMetricsOrchestrator;

    @Autowired
    private ProactiveInsightService proactiveInsightService;

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
    @PreAuthorize("isAuthenticated()")
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
        UserContext snapshot = UserContext.get() != null ? UserContext.get().copy() : null;
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
        intelligenceMetricsOrchestrator.update(m,
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
    @Deprecated // 计划于 2026-08-10 移除，请使用新端点替代
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

    @PostMapping("/visual/style-parse")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "样衣图片结构化字段识别由视觉AI生成")
    public Result<VisionAnalysisService.StyleFieldParseResult> visualStyleParse(@RequestBody Map<String, Object> body) {
        String imageUrl = (String) body.get("imageUrl");
        if (imageUrl == null || imageUrl.isBlank()) {
            return Result.fail("imageUrl 不能为空");
        }
        return Result.success(visualAIOrchestrator.parseStyleFields(imageUrl));
    }

    @PostMapping("/visual/receipt-parse")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "发票/收据/采购单据 OCR 识别结果由视觉AI生成")
    public Result<VisionAnalysisService.ReceiptParseResult> receiptParse(@RequestBody Map<String, Object> body) {
        String imageUrl = (String) body.get("imageUrl");
        if (imageUrl == null || imageUrl.isBlank()) {
            return Result.fail("imageUrl 不能为空");
        }
        return Result.success(visualAIOrchestrator.parseReceipt(imageUrl));
    }

    @PostMapping("/visual/style-search")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "以图搜款由视觉AI识别+关键词搜索生成")
    public Result<Map<String, Object>> styleSearchByImage(@RequestBody Map<String, Object> body) {
        String imageUrl = (String) body.get("imageUrl");
        Integer topK = body.get("topK") != null ? ((Number) body.get("topK")).intValue() : 5;
        if (imageUrl == null || imageUrl.isBlank()) {
            return Result.fail("imageUrl 不能为空");
        }

        Long tenantId = null;
        try { tenantId = UserContext.tenantId(); } catch (Exception ignored) {}
        log.info("[以图搜款] 请求 tenantId={} imageUrlLen={} 算法=Agnes识别+MySQL关键词搜索",
                tenantId, imageUrl.length());

        try {
            // Agnes 识别图片 → 提取关键词 → MySQL 关键词搜索
            Map<String, Object> result = visualAIOrchestrator.searchSimilarStylesByImage(imageUrl, topK);
            if (result != null && Boolean.FALSE.equals(result.get("success"))) {
                String err = (String) result.getOrDefault("error", "未知错误");
                log.warn("[以图搜款] ⚠ 内部失败: {}", err);
                return Result.fail("以图搜款服务异常: " + err);
            }
            return Result.success(result);
        } catch (Exception e) {
            log.error("[以图搜款] ❌ 异常: {}", e.getMessage(), e);
            return Result.fail("以图搜款服务异常: " + e.getMessage());
        }
    }

    @PostMapping("/visual/size-chart-parse")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "尺码表OCR识别由视觉AI生成")
    public Result<VisionAnalysisService.SizeChartParseResult> sizeChartParse(@RequestBody Map<String, Object> body) {
        String imageUrl = (String) body.get("imageUrl");
        if (imageUrl == null || imageUrl.isBlank()) {
            return Result.fail("imageUrl 不能为空");
        }
        try {
            VisionAnalysisService.SizeChartParseResult result = visualAIOrchestrator.parseSizeChart(imageUrl);
            if (result == null || !result.isAvailable()) {
                return Result.fail(result != null ? result.getErrorMessage() : "尺码表识别失败");
            }
            return Result.success(result);
        } catch (Exception e) {
            log.error("[尺码表识别] 异常: {}", e.getMessage(), e);
            return Result.fail("尺码表识别服务异常: " + e.getMessage());
        }
    }

    @PostMapping("/visual/bom-extract")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "BOM清单OCR识别由视觉AI生成")
    public Result<VisionAnalysisService.BomExtractResult> bomExtract(@RequestBody Map<String, Object> body) {
        String imageUrl = (String) body.get("imageUrl");
        if (imageUrl == null || imageUrl.isBlank()) {
            return Result.fail("imageUrl 不能为空");
        }
        try {
            VisionAnalysisService.BomExtractResult result = visualAIOrchestrator.parseBomExtract(imageUrl);
            if (result == null || !result.isAvailable()) {
                return Result.fail(result != null ? result.getErrorMessage() : "BOM识别失败");
            }
            return Result.success(result);
        } catch (Exception e) {
            log.error("[BOM识别] 异常: {}", e.getMessage(), e);
            return Result.fail("BOM识别服务异常: " + e.getMessage());
        }
    }

    /**
     * 运行时诊断端点 — 排查 Agnes/DeepSeek 配置是否正确注入
     * 浏览器访问: GET /api/intelligence/visual/diag
     */
    @GetMapping("/visual/diag")
    public Result<Map<String, Object>> visualDiag() {
        Map<String, Object> diag = new java.util.LinkedHashMap<>();
        try {
            diag.put("tenantId", UserContext.tenantId());
        } catch (Exception e) { diag.put("tenantId", "ERROR: " + e.getMessage()); }

        // 读取 QdrantService 配置状态（通过反射或调用公开方法）
        diag.put("qdrantServiceReady", qdrantService != null);
        if (qdrantService != null) {
            // 探测向量生成路径
            try {
                diag.put("vectorDim", qdrantService.getVectorDimInfo());
            } catch (Exception e) {
                diag.put("vectorDim", "ERROR: " + e.getMessage());
            }
        }

        // 读取 InferenceOrchestrator 的视觉模型状态
        diag.put("visualAIOrchReady", visualAIOrchestrator != null);

        // Spring 环境变量原始值探测
        diag.put("agnesKeyConfigured",
                org.springframework.util.StringUtils.hasText(agnesApiKey) && !agnesApiKey.trim().isEmpty());
        diag.put("deepseekKeyConfigured",
                org.springframework.util.StringUtils.hasText(deepseekApiKey) && !deepseekApiKey.trim().isEmpty());

        diag.put("agnesModel", agnesModel);
        diag.put("deepseekModel", deepseekModel);

        diag.put("hint",
                "如果 agnesKeyConfigured=false，请在微信云部署→环境变量中添加 AGNES_API_KEY=你的key");
        return Result.success(diag);
    }

    private Map<String, Object> visualStyleSearch(String imageUrl, int topK) {
        // 已废弃：之前用 Qdrant 向量搜索，现在用 Agnes 识别 + MySQL 关键词搜索
        // 见 visualAIOrchestrator.searchSimilarStylesByImage
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("success", false);
        result.put("error", "方法已废弃，请使用新的 visualAIOrchestrator.searchSimilarStylesByImage");
        return result;
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
    @Deprecated // 计划于 2026-08-10 移除，请使用新端点替代
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

    /** 获取当前租户的未读主动洞察列表 */
    @GetMapping("/insights")
    public Result<java.util.List<ProactiveInsightService.InsightItem>> getUnreadInsights() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("租户信息缺失");
        }
        return Result.success(proactiveInsightService.getUnreadInsights(tenantId));
    }

    /** 标记洞察已读 */
    @PostMapping("/insights/{id}/read")
    public Result<Void> markInsightAsRead(@PathVariable String id) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("租户信息缺失");
        }
        proactiveInsightService.markAsRead(tenantId, id);
        return Result.success(null);
    }

    /** v2: AI 模型自检测试点 — 快速测试各模型（Agnes/DeepSeek）连通性 */
    @GetMapping("/model-diagnostics")
    @PreAuthorize("isAuthenticated()")
    public Result<java.util.Map<String, Object>> runModelDiagnostics() {
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();

        // 检查配置（不暴露具体 key，只告知是否已配置）
        java.util.Map<String, Object> configStatus = new java.util.LinkedHashMap<>();
        configStatus.put("agnes_configured", agnesApiKey != null && !agnesApiKey.isBlank() && !agnesApiKey.startsWith("${"));
        configStatus.put("agnes_model", agnesModel);
        configStatus.put("deepseek_configured", deepseekApiKey != null && !deepseekApiKey.isBlank() && !deepseekApiKey.startsWith("${"));
        configStatus.put("deepseek_model", deepseekModel);
        result.put("configStatus", configStatus);

        // 快速连通性测试（短消息 + 短超时）
        java.util.List<java.util.Map<String, Object>> tests = new java.util.ArrayList<>();

        // 测试1: 快速文字推断（验证 token/网络/模型）
        java.util.Map<String, Object> textTest = new java.util.LinkedHashMap<>();
        textTest.put("name", "basic_text_inference");
        long startTs = System.currentTimeMillis();
        try {
            String question = "请只回复一个单词：OK";
            Result<String> agentResult = aiAgentOrchestrator.executeAgent(question, null, AgentMode.DEFAULT);
            String content = agentResult != null ? agentResult.getData() : null;
            String commandId = aiAgentOrchestrator.consumeLastCommandId();
            textTest.put("status", "ok");
            textTest.put("commandId", commandId);
            textTest.put("elapsedMs", System.currentTimeMillis() - startTs);
            textTest.put("preview", content != null
                    ? content.substring(0, Math.min(80, content.length())) + "..."
                    : "无内容");
        } catch (Exception e) {
            textTest.put("status", "error");
            textTest.put("elapsedMs", System.currentTimeMillis() - startTs);
            textTest.put("error", e.getMessage());
        }
        tests.add(textTest);

        result.put("tests", tests);
        result.put("modelCount", tests.size());
        return Result.success(result);
    }
}
