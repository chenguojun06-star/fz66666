package com.fashion.supplychain.intelligence.orchestration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 等待感知回归守护（D-702 性能第二阶段）
 *
 * <p>用户反馈：「回答太慢，人员点击就可以看，远远不够人员去点击查看来的更快」。
 * 第一阶段解决了"总时长"，但**体感的主因不是总时长，而是"慢得没有反馈"**。
 *
 * <p>用生产日志核对后端实际发过什么：
 * <ul>
 *   <li>{@code StreamingAgentLoopCallback} 一直在发 {@code thinking} /
 *       {@code tool_call} / {@code tool_result}，前端
 *       {@code xiaoyunUnifiedHandler} 也在消费 —— 这段是通的；</li>
 *   <li><b>但 GoT / ToT / DAG 三次串行 LLM 发生在这些事件之前</b>，
 *       且期间<b>不发任何 SSE</b>。用户按下回车后只能盯着空白屏幕 13 秒，
 *       完全无法判断系统是在工作还是卡死。</li>
 * </ul>
 *
 * <p>本次只做两件事，都不触碰数据：
 * <ol>
 *   <li><b>立即发 thinking</b>：感知延迟 13s → &lt;100ms；</li>
 *   <li><b>并行 + 限时</b>：三次串行 LLM 降为一次等待，配硬预算兜底。</li>
 * </ol>
 */
@DisplayName("等待感知（D-702：13 秒无反馈的空白等待）")
class StreamingFeedbackGuardTest {

    private static final List<String> ORCH_CANDIDATES = List.of(
            "src/main/java/com/fashion/supplychain/intelligence/orchestration/AiAgentOrchestrator.java",
            "backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/AiAgentOrchestrator.java");

    private static String source() throws Exception {
        for (String p : ORCH_CANDIDATES) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到 AiAgentOrchestrator.java");
    }

    @Test
    @DisplayName("① 高级推理提示之前必须先发 thinking：否则用户面对十几秒空白")
    void thinkingMustBeSentBeforeReasoningHints() throws Exception {
        String s = source();
        int planningEvent = s.indexOf("emitSse(emitter, \"thinking\", java.util.Map.of(\"stage\", \"planning\"))");
        int advancedCall = s.indexOf("safeAdvancedReasoning(msgForReasoning");
        assertThat(planningEvent)
                .as("thinking 事件必须在 GoT/ToT/DAG 之前发出，否则前面的十几秒毫无反馈")
                .isGreaterThan(0);
        assertThat(advancedCall).as("应存在异步高级推理调用").isGreaterThan(0);
        assertThat(planningEvent)
                .as("thinking 必须早于高级推理调用")
                .isLessThan(advancedCall);
    }

    @Test
    @DisplayName("① 查询阶段也要有反馈事件：Agent 循环开始前让用户知道在查数据")
    void queryingStageFeedbackSent() throws Exception {
        String s = source();
        assertThat(s)
                .as("Agent 循环（含工具执行）耗时长，需要区分阶段让用户知道在做什么")
                .contains("emitSse(emitter, \"thinking\", java.util.Map.of(\"stage\", \"querying\"))");
    }

    @Test
    @DisplayName("② GoT/ToT 与 DAG 必须并行：原先是三次串行 LLM")
    void reasoningHintsAreParallelized() throws Exception {
        String s = source();
        int reasoning = s.indexOf("CompletableFuture.supplyAsync(\n                            () -> safeAdvancedReasoning");
        int dag = s.indexOf("CompletableFuture.supplyAsync(\n                            () -> safeIntentDrivenDag");
        assertThat(reasoning).as("高级推理应异步启动").isGreaterThan(0);
        assertThat(dag).as("DAG 规划应异步启动").isGreaterThan(0);
        assertThat(reasoning)
                .as("两者必须都先 submit 再 get，而不是 submit 一个等完再 submit 下一个")
                .isLessThan(dag);
        // 确认是 submit 后统一 get，而非串行 get
        int firstGet = s.indexOf("reasoningFuture.get(");
        int secondSubmitEnd = s.indexOf("() -> safeIntentDrivenDag");
        assertThat(firstGet).as("先 submit 两个再 get").isGreaterThan(secondSubmitEnd);
    }

    @Test
    @DisplayName("② 提示必须有硬时间预算，超时降级而非拖慢主链路")
    void reasoningHintsHaveBudgetAndDegrade() throws Exception {
        String s = source();
        assertThat(s)
                .as("这些提示只影响回答丰富度，不影响数据准确性，必须有时间上限")
                .contains("xiaoyun.agent.reasoning-hint-budget-ms");
        assertThat(s)
                .as("超时须降级为跳过提示，并记录原因")
                .contains("降级跳过")
                .contains("reasoningFuture.cancel(true)");
    }

    @Test
    @DisplayName("③ 提示异常不得影响主链路：必须包一层 try-catch")
    void hintFailuresAreIsolated() throws Exception {
        String s = source();
        assertThat(s)
                .as("CompletableFuture 内未捕获异常会被吞成 null，但降级原因需可观测")
                .contains("safeAdvancedReasoning")
                .contains("safeIntentDrivenDag");
        int start = s.indexOf("private String safeAdvancedReasoning");
        assertThat(start).as("应有安全包装方法").isGreaterThan(0);
        String m = s.substring(start, Math.min(start + 400, s.length()));
        assertThat(m).contains("catch (Exception e)");
    }

    @Test
    @DisplayName("④ 本次只改提示层：工具与数据链路必须原样保留")
    void toolAndDataPathUntouched() throws Exception {
        String s = source();
        assertThat(s)
                .as("工具可见性/裁剪/预选与 Agent 循环本身都不能动")
                .contains("contextBuilder.build(userMessage, augmentedPageContext)")
                .contains("StreamingAgentLoopCallback cb")
                .contains("loopEngine.run(ctx, cb)");
        assertThat(s)
                .as("GoT/ToT/DAG 三者都只是注入上下文提示，不得出现直接 return 覆盖主链路的写法")
                .doesNotContain("return dagHint;");
    }
}