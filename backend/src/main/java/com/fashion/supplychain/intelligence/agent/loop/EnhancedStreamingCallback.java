package com.fashion.supplychain.intelligence.agent.loop;

import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.agent.sse.SseEmitterHelper;
import com.fashion.supplychain.intelligence.agent.sse.SseEvent;
import com.fashion.supplychain.intelligence.helper.AiAgentMemoryHelper;
import com.fashion.supplychain.intelligence.orchestration.DecisionCardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.LongTermMemoryOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.*;

/**
 * 增强流式回调 — 在 StreamingAgentLoopCallback 基础上增加实时进度推送。
 * <p>
 * 新增 SSE 事件类型：
 * <ul>
 *   <li><b>step_progress</b> — 步骤进度（当前第几步/总几步/阶段/消息）</li>
 *   <li><b>tool_executing</b> — 工具执行中动画（图标/消息/并行数）</li>
 *   <li><b>data_card</b> — 结构化数据卡片（图表/操作卡）</li>
 *   <li><b>time_budget</b> — 时间预算（已用/剩余/超时）</li>
 *   <li><b>xiaoyun_mood</b> — 小云表情（思考/搜索/计算/开心/警告/完成）</li>
 * </ul>
 * </p>
 */
@Slf4j
public class EnhancedStreamingCallback extends StreamingAgentLoopCallback {

    private final SseEmitter emitter;
    private final Instant requestStartTime;
    private final List<StepEvent> stepTimeline = new ArrayList<>();

    public EnhancedStreamingCallback(SseEmitter emitter,
                                     AgentLoopContext ctx,
                                     AiAgentMemoryHelper memoryHelper,
                                     DecisionCardOrchestrator decisionCardOrchestrator,
                                     LongTermMemoryOrchestrator longTermMemoryOrchestrator) {
        super(emitter, ctx, memoryHelper, decisionCardOrchestrator, longTermMemoryOrchestrator);
        this.emitter = emitter;
        this.requestStartTime = Instant.now();
    }

    // ===== 新增事件 =====

    /** 发送步骤进度事件 */
    public void onStepProgress(int step, int total, String phase, String message) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("step", step);
        event.put("total", total);
        event.put("phase", phase);
        event.put("message", message);
        event.put("elapsedMs", elapsedMs());
        emitEnhanced("step_progress", event);
        stepTimeline.add(new StepEvent(phase, message, Instant.now()));
    }

    /** 发送工具执行中事件 */
    public void onToolExecuting(String toolName, String icon, int parallelCount) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("tool", toolName);
        event.put("icon", icon != null ? icon : resolveToolIcon(toolName));
        event.put("parallel", parallelCount);
        event.put("elapsedMs", elapsedMs());
        emitEnhanced("tool_executing", event);
        stepTimeline.add(new StepEvent("tool_executing", toolName, Instant.now()));
    }

    /** 发送数据卡片事件 */
    public void onDataCard(String cardType, String title, Map<String, Object> data) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", cardType);
        event.put("title", title);
        event.put("data", data);
        event.put("elapsedMs", elapsedMs());
        emitEnhanced("data_card", event);
    }

    /** 发送时间预算事件 */
    public void onTimeBudget(long timeoutMs) {
        long elapsed = elapsedMs();
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("elapsedMs", elapsed);
        event.put("remainingMs", Math.max(0, timeoutMs - elapsed));
        event.put("timeoutMs", timeoutMs);
        emitEnhanced("time_budget", event);
    }

    /** 发送小云表情事件 */
    public void onXiaoyunMood(String mood, String message) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("mood", mood);
        event.put("message", message);
        event.put("elapsedMs", elapsedMs());
        emitEnhanced("xiaoyun_mood", event);
    }

    // ===== 覆盖父类方法增强 =====

    @Override
    public void onThinking(int iteration, String message) {
        onXiaoyunMood("thinking", message);
        super.onThinking(iteration, message);
    }

    @Override
    public void onToolCall(AiToolCall toolCall) {
        String toolName = toolCall.getFunction() != null ? toolCall.getFunction().getName() : "unknown";
        onToolExecuting(toolName, resolveToolIcon(toolName), 1);
        onXiaoyunMood("searching", "调用工具: " + toolName);
        super.onToolCall(toolCall);
    }

    @Override
    public void onToolResult(String toolName, boolean success, String summary) {
        onXiaoyunMood(success ? "happy" : "warning",
                success ? "查询完成" : "查询遇到问题");
        super.onToolResult(toolName, success, summary);
    }

    @Override
    public void onAnswer(String content, String commandId) {
        onXiaoyunMood("done", "回答已生成");
        super.onAnswer(content, commandId);
    }

    // ===== 辅助方法 =====

    private long elapsedMs() {
        return java.time.Duration.between(requestStartTime, Instant.now()).toMillis();
    }

    private void emitEnhanced(String eventName, Map<String, Object> data) {
        try {
            SseEmitterHelper.send(emitter, SseEvent.of(eventName, data));
        } catch (Exception e) {
            log.debug("[EnhancedSSE] 事件发送失败: type={}, err={}", eventName, e.getMessage());
        }
    }

    /** 根据工具名推断图标 */
    public static String resolveToolIcon(String toolName) {
        if (toolName == null) return "🔧";
        String name = toolName.toLowerCase();
        if (name.contains("order") || name.contains("production") || name.contains("progress")) return "📦";
        if (name.contains("warehouse") || name.contains("stock") || name.contains("inventory")) return "🏗️";
        if (name.contains("finance") || name.contains("payroll") || name.contains("invoice")) return "💰";
        if (name.contains("style") || name.contains("sample") || name.contains("pattern")) return "👗";
        if (name.contains("quality") || name.contains("defect") || name.contains("inspect")) return "🔍";
        if (name.contains("scan")) return "📱";
        if (name.contains("material") || name.contains("procurement") || name.contains("purchase")) return "🧵";
        if (name.contains("report") || name.contains("analysis") || name.contains("dashboard")) return "📊";
        if (name.contains("knowledge") || name.contains("search") || name.contains("rag")) return "📚";
        if (name.contains("think") || name.contains("plan")) return "💭";
        if (name.contains("customer") || name.contains("crm")) return "🤝";
        if (name.contains("supplier") || name.contains("factory")) return "🏭";
        if (name.contains("logistics") || name.contains("ship")) return "🚚";
        return "🔧";
    }

    /** 获取步骤时间线 */
    public List<StepEvent> getStepTimeline() {
        return new ArrayList<>(stepTimeline);
    }

    /** 步骤事件 */
    public record StepEvent(String phase, String message, Instant timestamp) {}
}
