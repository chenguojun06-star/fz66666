package com.fashion.supplychain.intelligence.agent.loop;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-702：异步后处理结果此前从未发给用户。
 *
 * <p>{@code asyncPostProcess} 跑完 Critic 审查 / InsightCard / SelfCritiqueGate /
 * 数据真实性守卫（5~30 秒、多次 LLM 调用）后，只调用 {@code completeSession(ctx, content)}
 * 写会话历史，<b>全程没有再发一次 {@code cb.onAnswer}</b> ——
 * 用户永远看不到自己那份已经算好的改进版，守卫警告同样看不到。
 *
 * <p>同时「首次回答即关闭 SSE」被移除，连接关闭时机改为由
 * {@code onPostProcessFinished} 负责，因此必须锁住收尾不会漏。
 */
@DisplayName("审查改进版补发（D-702：算了就别白算）")
class RefinedAnswerDeliveryTest {

    private static String read(String rel) throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/intelligence/agent/loop/" + rel,
                "backend/src/main/java/com/fashion/supplychain/intelligence/agent/loop/" + rel)) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到 " + rel);
    }

    private static String engine() throws Exception {
        return read("AgentLoopEngine.java");
    }

    @Test
    @DisplayName("① 后处理必须把最终内容补发出去")
    void refinedAnswerMustBeSent() throws Exception {
        String s = engine();
        assertThat(s)
                .as("asyncPostProcess 必须补发审查后的内容")
                .contains("cb.onRefinedAnswer(refined, ctx.getCommandId())");
        // 补发必须发生在 follow_up_actions 之前，否则前端合并会覆盖掉建议
        int send = s.indexOf("cb.onRefinedAnswer(");
        int followUp = s.indexOf("cb.onFollowUpActions(");
        assertThat(send).as("应存在补发调用").isGreaterThan(0);
        assertThat(followUp).as("应存在后续建议调用").isGreaterThan(0);
        assertThat(send)
                .as("补发必须早于 follow_up_actions")
                .isLessThan(followUp);
    }

    @Test
    @DisplayName("② 退化内容不得补发（空/相同/长度不足一半）")
    void degradedRefinedAnswerMustBeRejected() throws Exception {
        String s = engine();
        assertThat(s).contains("shouldRefinedAnswerBeSent");
        int m = s.indexOf("private boolean shouldRefinedAnswerBeSent");
        String body = s.substring(m, Math.min(m + 1400, s.length()));
        assertThat(body).as("空内容必须拒绝").contains("refined.isBlank()");
        assertThat(body).as("与原文相同必须拒绝（避免气泡无意义闪烁）").contains("refined.trim().equals(fastContent.trim())");
        assertThat(body)
                .as("长度不足原文一半必须拒绝（疑似截断丢数据）")
                .contains("refined.length() * 2 < originalLen");
    }

    @Test
    @DisplayName("③ SSE 收尾必须无条件执行：finally 里兜底")
    void sseAlwaysClosed() throws Exception {
        String s = engine();
        int m = s.indexOf("private void asyncPostProcess");
        String body = s.substring(m, Math.min(m + 1200, s.length()));
        assertThat(body)
                .as("必须有 finally 兜底收尾")
                .contains("finally")
                .contains("cb.onPostProcessFinished()");
    }

    @Test
    @DisplayName("④ 线程池拒绝调度时也必须收尾，否则连接悬挂到 SSE 超时")
    void rejectedSchedulingStillCloses() throws Exception {
        String s = engine();
        assertThat(s)
                .as("调度失败必须显式收尾")
                .contains("异步后处理调度失败")
                .contains("finalCb.onPostProcessFinished()");
    }

    @Test
    @DisplayName("⑤ 流式回调：首次回答不再立即关闭，且有兜底定时器")
    void streamingCallbackKeepsChannelOpen() throws Exception {
        String s = read("StreamingAgentLoopCallback.java");
        int onAnswer = s.indexOf("public void onAnswer(String content, String commandId)");
        String body = s.substring(onAnswer, Math.min(onAnswer + 1600, s.length()));
        assertThat(body)
                .as("onAnswer 内不得再 emitter.complete()")
                .doesNotContain("emitter.complete()");
        assertThat(body).as("应挂兜底定时器").contains("armPostProcessSafetyTimer()");

        assertThat(s)
                .as("必须有兜底超时，防止连接悬挂")
                .contains("POST_PROCESS_MAX_WAIT_MS")
                .contains("closeEmitter()");
    }

    @Test
    @DisplayName("⑥ 每个终止分支都必须关闭并取消定时器")
    void allTerminalBranchesClose() throws Exception {
        String s = read("StreamingAgentLoopCallback.java");
        for (String m : List.of("onDone", "onError", "onStuckDetected", "onTokenBudgetExceeded",
                "onPlanMode", "onMaxIterationsExceeded", "onPostProcessFinished")) {
            int start = s.indexOf("public void " + m + "(");
            assertThat(start).as("应存在 " + m).isGreaterThan(0);
            String body = s.substring(start, s.indexOf("\n    }", start));
            assertThat(body)
                    .as(m + " 必须关闭 emitter")
                    .contains("closeEmitter");
        }
        // 关闭时必须取消兜底定时器，否则定时任务泄漏
        assertThat(s).contains("cancelPostProcessSafetyTimer()");
    }

    /**
     * 线上真实故障（D-702 回归）：问「你会什么啊」后，回答变成
     * 「小云暂时无法给出回答，请稍后再试」。
     *
     * <p>根因是本轮补发逻辑自己的漏洞：空判断写在 {@code sanitize/deduplicate} <b>之前</b>。
     * 清洗会剥离 prompt 内部标记与敏感内容，<b>原始非空不代表清洗后非空</b>；
     * 空串被当 answer 发出后，前端 {@code parseAiResponse} 得到空 displayText，
     * 于是用兜底文案把用户已经看到的正常答案覆盖掉。
     */
    @Test
    @DisplayName("⑧ 清洗后为空必须放弃补发，且不得覆盖已发出的答案（线上故障回归）")
    void blankAfterSanitizeMustNotOverwrite() throws Exception {
        String s = read("StreamingAgentLoopCallback.java");
        int start = s.indexOf("public void onRefinedAnswer(String content, String commandId)");
        String body = s.substring(start, s.indexOf("\n    }", start));

        int sanitize = body.indexOf("String sanitized = sanitize(");
        int blankGuard = body.indexOf("sanitized.isBlank()");
        // 已改为统一收口：发送必须走 emitAnswer，而不是直接 emitSse
        int emit = body.indexOf("emitAnswer(");
        assertThat(sanitize).as("应存在清洗步骤").isGreaterThan(0);
        assertThat(blankGuard).as("必须对清洗后的结果判空").isGreaterThan(0);
        assertThat(emit).as("补发必须走统一收口 emitAnswer").isGreaterThan(0);
        assertThat(blankGuard)
                .as("判空必须发生在清洗之后、发送之前 —— 否则空串会覆盖用户已看到的答案")
                .isGreaterThan(sanitize)
                .isLessThan(emit);
        // 且必须在 emit 之前 return
        assertThat(body.indexOf("return;", blankGuard))
                .as("清洗后为空必须直接放弃")
                .isLessThan(emit);
        // 不得绕过收口直接发
        assertThat(body)
                .as("补发路径不得绕过收口")
                .doesNotContain("emitSse(\"answer\"");
    }
}