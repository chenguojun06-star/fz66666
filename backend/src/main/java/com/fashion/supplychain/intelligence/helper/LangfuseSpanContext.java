package com.fashion.supplychain.intelligence.helper;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.List;

/**
 * P0-4: Langfuse 全链路追踪的 ThreadLocal span 栈。
 *
 * <p>使用 ThreadLocal + Deque<SpanFrame> 维护当前线程的 span 栈，
 * 支持父子 span 嵌套。每个会话（SSE 请求）开始时调用 {@link #pushRoot} 建立 trace 根，
 * 子 span 通过 {@link #beginChild} 压栈，结束时通过 {@link #endCurrent} 出栈。
 *
 * <p>本类不直接调用 Langfuse API，只维护 spanId/parentId 元数据。
 * Langfuse API 调用由 {@link LangfuseSpanHelper} + {@code LangfuseTraceOrchestrator} 完成。
 *
 * <p>关键约束：
 * <ul>
 *   <li>ThreadLocal 必须 clear() 防止内存泄漏（请求结束时调用 {@link #clear}）</li>
 *   <li>snapshot/restore 用于线程池上下文传递场景</li>
 *   <li>所有方法线程安全（ThreadLocal 隔离）</li>
 * </ul>
 */
@Component
@Slf4j
public class LangfuseSpanContext {

    private static final ThreadLocal<Deque<SpanFrame>> spanStack =
            ThreadLocal.withInitial(ArrayDeque::new);

    private static final ThreadLocal<String> rootTraceId = new ThreadLocal<>();

    /** span 帧结构（不可变） */
    public static class SpanFrame {
        private final String spanId;
        private final String spanName;
        private final long startTimeMs;
        private final String parentId;

        public SpanFrame(String spanId, String spanName, long startTimeMs, String parentId) {
            this.spanId = spanId;
            this.spanName = spanName;
            this.startTimeMs = startTimeMs;
            this.parentId = parentId;
        }

        public String getSpanId() { return spanId; }
        public String getSpanName() { return spanName; }
        public long getStartTimeMs() { return startTimeMs; }
        public String getParentId() { return parentId; }
    }

    /**
     * 推入 root span（trace 根）。会先清空已有栈，再设置 rootTraceId 和 root span。
     *
     * @param traceId      trace ID（通常等于 commandId，保证全链路一致）
     * @param rootSpanId   root span 的 observation ID
     * @param rootSpanName root span 名称（如 "streaming_chat"）
     */
    public void pushRoot(String traceId, String rootSpanId, String rootSpanName) {
        clear();
        rootTraceId.set(traceId);
        SpanFrame frame = new SpanFrame(rootSpanId, rootSpanName, System.currentTimeMillis(), null);
        spanStack.get().push(frame);
    }

    /**
     * 在当前 span 下创建子 span（压栈）。
     *
     * @param childSpanId   子 span ID（由调用方生成，通常 UUID）
     * @param childSpanName 子 span 名称
     * @return 传入的 childSpanId（便于链式调用）
     */
    public String beginChild(String childSpanId, String childSpanName) {
        Deque<SpanFrame> stack = spanStack.get();
        String parentId = stack.isEmpty() ? null : stack.peek().getSpanId();
        SpanFrame frame = new SpanFrame(childSpanId, childSpanName, System.currentTimeMillis(), parentId);
        stack.push(frame);
        return childSpanId;
    }

    /**
     * 结束当前 span（栈顶弹出）。
     *
     * @return 弹出的 SpanFrame（栈空时返回 null）
     */
    public SpanFrame endCurrent() {
        Deque<SpanFrame> stack = spanStack.get();
        if (stack.isEmpty()) {
            log.debug("[LangfuseSpanContext] endCurrent 栈已空，跳过");
            return null;
        }
        return stack.pop();
    }

    /**
     * 获取当前栈顶 span（不弹出）。
     *
     * @return 栈顶 SpanFrame（栈空返回 null）
     */
    public SpanFrame current() {
        Deque<SpanFrame> stack = spanStack.get();
        return stack.isEmpty() ? null : stack.peek();
    }

    /**
     * 清空当前线程的 span 栈和 rootTraceId。
     *
     * <p>必须在请求结束时调用（finally 块），防止 ThreadLocal 内存泄漏。
     */
    public void clear() {
        spanStack.get().clear();
        rootTraceId.remove();
    }

    /**
     * 获取当前 trace ID（root trace id）。
     *
     * @return traceId（未调用 pushRoot 时返回 null）
     */
    public String getTraceId() {
        return rootTraceId.get();
    }

    /**
     * 快照当前 span 栈（用于线程池上下文传递）。
     *
     * @return 不可变列表（栈底→栈顶顺序），栈空返回空列表
     */
    public List<SpanFrame> snapshot() {
        Deque<SpanFrame> stack = spanStack.get();
        if (stack.isEmpty()) return Collections.emptyList();
        // ArrayDeque push/pop 顺序为栈顶→栈底，反转为栈底→栈顶便于恢复
        List<SpanFrame> snapshot = new ArrayList<>(stack);
        Collections.reverse(snapshot);
        return Collections.unmodifiableList(snapshot);
    }

    /**
     * 从快照恢复栈（配合 {@link #snapshot} 使用）。
     * 会先 clear 再按快照顺序压栈。
     *
     * @param snapshot 快照列表（栈底→栈顶顺序）
     * @param traceId  对应的 trace ID
     */
    public void restore(List<SpanFrame> snapshot, String traceId) {
        clear();
        if (snapshot == null || snapshot.isEmpty()) return;
        rootTraceId.set(traceId);
        Deque<SpanFrame> stack = spanStack.get();
        // snapshot 第一个是栈底，最后一个是栈顶；压栈需从栈顶开始（即倒序）
        for (int i = snapshot.size() - 1; i >= 0; i--) {
            stack.push(snapshot.get(i));
        }
    }

    /** 当前栈深度（debug/监控用） */
    public int depth() {
        return spanStack.get().size();
    }

    /** 判断当前是否有活跃 span（已调用 pushRoot 且未 clear） */
    public boolean hasActiveSpan() {
        return !spanStack.get().isEmpty();
    }
}
