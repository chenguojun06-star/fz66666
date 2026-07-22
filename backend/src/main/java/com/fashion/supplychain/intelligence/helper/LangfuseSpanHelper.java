package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.intelligence.orchestration.LangfuseTraceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * P0-4: Langfuse Span 便捷封装。
 *
 * <p>提供 try-with-resources 风格的 {@link SpanScope}，自动管理
 * {@code beginSpan}/{@code endSpan} 调用，并维护 {@link LangfuseSpanContext} 的 ThreadLocal 栈。
 *
 * <p>使用示例：
 * <pre>{@code
 * try (LangfuseSpanHelper.SpanScope scope = spanHelper.startSpan("llm_inference")) {
 *     // 业务逻辑
 *     scope.recordEvent("token_count", Map.of("tokens", 100));
 * } // 自动 endSpan
 * }</pre>
 *
 * <p>关键设计：
 * <ul>
 *   <li>{@code @Autowired(required=false)} 兼容 LangfuseTraceOrchestrator 未配置场景</li>
 *   <li>{@code enabled=false} 或 Langfuse 未配置时所有方法 no-op，{@link SpanScope#close()} 空实现</li>
 *   <li>所有异常吞掉（log.debug），不影响主流程</li>
 *   <li>{@link SpanScope} 是 AutoCloseable，配合 try-with-resources 保证异常时 endSpan</li>
 * </ul>
 */
@Component
@Slf4j
public class LangfuseSpanHelper {

    @Autowired(required = false)
    private LangfuseTraceOrchestrator langfuseTraceOrchestrator;

    @Autowired
    private LangfuseSpanContext spanContext;

    /**
     * span 追踪是否启用。
     * <p>默认 true，可通过 {@code ai.observability.langfuse.span.enabled=false} 关闭。
     * 即使 enabled=true，若 LangfuseTraceOrchestrator 未注入或未配置，仍会降级为 no-op。
     */
    @Value("${ai.observability.langfuse.span.enabled:true}")
    private boolean spanEnabled;

    /** 判断是否真正启用 span 追踪（配置开关 + orchestrator 可用 + 已配置 + 有活跃 root） */
    public boolean isEnabled() {
        return spanEnabled
                && langfuseTraceOrchestrator != null
                && langfuseTraceOrchestrator.isConfigured()
                && spanContext.hasActiveSpan();
    }

    /**
     * 启动一个子 span（在当前 span 栈顶之下）。
     *
     * @param spanName span 名称（如 "inject_memory"、"llm_inference"）
     * @return {@link SpanScope}（try-with-resources 自动 close）；不可用时返回 {@link SpanScope#NOOP}
     */
    public SpanScope startSpan(String spanName) {
        return startSpan(spanName, null);
    }

    /**
     * 启动一个子 span（带 metadata）。
     *
     * @param spanName span 名称
     * @param metadata 额外元数据（可为 null）
     * @return {@link SpanScope}；不可用时返回 {@link SpanScope#NOOP}
     */
    public SpanScope startSpan(String spanName, Map<String, Object> metadata) {
        if (!isEnabled()) {
            return SpanScope.NOOP;
        }
        try {
            String traceId = spanContext.getTraceId();
            LangfuseSpanContext.SpanFrame parent = spanContext.current();
            String parentId = parent != null ? parent.getSpanId() : null;
            String spanId = langfuseTraceOrchestrator.beginSpan(traceId, spanName, parentId, metadata);
            if (spanId == null) {
                return SpanScope.NOOP;
            }
            spanContext.beginChild(spanId, spanName);
            return new SpanScope(spanId, spanName, System.currentTimeMillis(), this);
        } catch (Exception e) {
            log.debug("[LangfuseSpanHelper] startSpan 异常（不影响业务）name={}: {}", spanName, e.getMessage());
            return SpanScope.NOOP;
        }
    }

    /**
     * 在当前 span 上记录 event。
     *
     * @param eventName 事件名称
     * @param payload   事件负载（可为 null）
     */
    public void recordEvent(String eventName, Map<String, Object> payload) {
        if (!isEnabled()) return;
        try {
            String traceId = spanContext.getTraceId();
            LangfuseSpanContext.SpanFrame current = spanContext.current();
            String spanId = current != null ? current.getSpanId() : null;
            langfuseTraceOrchestrator.recordEvent(traceId, spanId, eventName, payload);
        } catch (Exception e) {
            log.debug("[LangfuseSpanHelper] recordEvent 异常: {}", e.getMessage());
        }
    }

    /**
     * 在当前 span 上记录 generation（LLM 调用）。
     *
     * @param model      模型名称
     * @param prompt     输入 prompt
     * @param completion 输出 completion
     * @param durationMs 持续时间（毫秒）
     */
    public void recordGeneration(String model, String prompt, String completion, Long durationMs) {
        if (!isEnabled()) return;
        try {
            String traceId = spanContext.getTraceId();
            LangfuseSpanContext.SpanFrame current = spanContext.current();
            String spanId = current != null ? current.getSpanId() : null;
            langfuseTraceOrchestrator.recordGeneration(traceId, spanId, model, prompt, completion, durationMs);
        } catch (Exception e) {
            log.debug("[LangfuseSpanHelper] recordGeneration 异常: {}", e.getMessage());
        }
    }

    /**
     * 内部：结束 span（由 {@link SpanScope#close()} 调用）。
     * 同时调 Langfuse endSpan API 和 spanContext.endCurrent 出栈。
     */
    void endSpanInternal(String spanId, long startTimeMs) {
        try {
            long durationMs = System.currentTimeMillis() - startTimeMs;
            langfuseTraceOrchestrator.endSpan(spanId, durationMs, "DEFAULT", null);
            spanContext.endCurrent();
        } catch (Exception e) {
            log.debug("[LangfuseSpanHelper] endSpan 异常 spanId={}: {}", spanId, e.getMessage());
        }
    }

    /**
     * SpanScope — try-with-resources 资源对象。
     *
     * <p>close() 自动调用 endSpanInternal 完成 span 结束。
     * 不可用时为 {@link #NOOP} 单例，所有方法空实现。
     */
    public static class SpanScope implements AutoCloseable {

        /** 全局 no-op 单例（Langfuse 不可用时使用） */
        public static final SpanScope NOOP = new SpanScope(null, null, 0L, null);

        private final String spanId;
        private final String spanName;
        private final long startTimeMs;
        private final LangfuseSpanHelper helper;

        private SpanScope(String spanId, String spanName, long startTimeMs, LangfuseSpanHelper helper) {
            this.spanId = spanId;
            this.spanName = spanName;
            this.startTimeMs = startTimeMs;
            this.helper = helper;
        }

        /** 获取当前 span ID（no-op 时为 null） */
        public String getSpanId() { return spanId; }

        /** 获取当前 span 名称 */
        public String getSpanName() { return spanName; }

        /** 是否为活跃 span（非 no-op） */
        public boolean isActive() { return spanId != null && helper != null; }

        /**
         * 在当前 span 上记录 event（便捷方法）。
         * no-op 时空操作。
         */
        public void recordEvent(String eventName, Map<String, Object> payload) {
            if (helper == null) return;
            helper.recordEvent(eventName, payload);
        }

        /**
         * 在当前 span 上记录 generation（便捷方法）。
         * no-op 时空操作。
         */
        public void recordGeneration(String model, String prompt, String completion, Long durationMs) {
            if (helper == null) return;
            helper.recordGeneration(model, prompt, completion, durationMs);
        }

        /**
         * 关闭 span（自动调用 endSpan）。
         * <p>不可抛异常（AutoCloseable 契约），失败时 log.debug。
         */
        @Override
        public void close() {
            if (helper == null || spanId == null) return;
            helper.endSpanInternal(spanId, startTimeMs);
        }
    }
}
