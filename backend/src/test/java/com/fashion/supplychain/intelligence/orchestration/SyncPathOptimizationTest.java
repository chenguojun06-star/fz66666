package com.fashion.supplychain.intelligence.orchestration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-702：同步链路（IM / 公众号 / OpenAI 兼容）优化。
 *
 * <p>两个实测问题：
 * <ol>
 *   <li><b>直查只在流式路径</b>：{@code directQueryRouter} 此前仅在
 *       {@code executeAgentStreaming}（PC 端）调用。IM / 公众号 / OpenAI 兼容
 *       全部走 {@code executeAgent}，于是「订单进度」「有没有异常」在手机上要等 20 秒，
 *       PC 上只要 0.5 秒 —— 同一套数据两个入口体验差 40 倍。</li>
 *   <li><b>高级推理无墙钟上限</b>：生产实测单次 GoT expand 平均 <b>8.5s</b>
 *       （最高 11.2s），GoT 最多 4 轮、失败再串行跑一轮 ToT，最坏 30s+。
 *       而它产出的只是注入上下文的提示，不是答案。</li>
 * </ol>
 */
@DisplayName("同步链路提速（D-702：手机端也能秒回）")
class SyncPathOptimizationTest {

    private static String orch() throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/intelligence/orchestration/AiAgentOrchestrator.java",
                "backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/AiAgentOrchestrator.java")) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到 AiAgentOrchestrator.java");
    }

    @Test
    @DisplayName("① 同步路径必须能直查（此前只有流式路径有）")
    void syncPathHasDirectQuery() throws Exception {
        String s = orch();
        // executeAgent(String,String) 方法体起点
        int start = s.indexOf("public Result<String> executeAgent(String userMessage, String pageContext) {");
        assertThat(start).as("应存在同步入口").isGreaterThan(0);
        // 到下一个 public 方法为止
        int end = s.indexOf("public Result<String> executeAgent", start + 10);
        String body = s.substring(start, end > 0 ? end : start + 4000);
        assertThat(body)
                .as("同步路径必须调用直查")
                .contains("directQueryRouter.tryDirectAnswer(userMessage)");
        assertThat(body)
                .as("命中后应直接返回，跳过 Agent 循环")
                .contains("Result.success(direct.text())");
    }

    @Test
    @DisplayName("② 直查必须早于多Agent图编排与高级推理")
    void directQueryBeforeExpensiveWork() throws Exception {
        String s = orch();
        int start = s.indexOf("public Result<String> executeAgent(String userMessage, String pageContext) {");
        int end = s.indexOf("public Result<String> executeAgent", start + 10);
        String body = s.substring(start, end > 0 ? end : start + 4000);
        int direct = body.indexOf("tryDirectAnswer");
        int multiAgent = body.indexOf("tryRouteToMultiAgentGraph");
        int advanced = body.indexOf("tryAdvancedReasoning");
        assertThat(direct).isGreaterThan(0);
        assertThat(multiAgent).isGreaterThan(direct);
        assertThat(advanced)
                .as("直查应在高级推理之前——否则确定性问题仍要先付 30s 推理代价")
                .isGreaterThan(direct);
    }

    @Test
    @DisplayName("③ 直查异常不得影响主链路")
    void directQueryFailureIsIsolated() throws Exception {
        String s = orch();
        int start = s.indexOf("public Result<String> executeAgent(String userMessage, String pageContext) {");
        int end = s.indexOf("public Result<String> executeAgent", start + 10);
        String body = s.substring(start, end > 0 ? end : start + 4000);
        int direct = body.indexOf("tryDirectAnswer");
        assertThat(body.substring(direct, Math.min(direct + 700, body.length())))
                .as("必须 try/catch 兜底")
                .contains("catch (Exception e)");
    }

    @Test
    @DisplayName("④ 高级推理必须有墙钟预算，超时不再叠加 ToT")
    void advancedReasoningHasBudget() throws Exception {
        String s = orch();
        assertThat(s)
                .as("必须有预算配置项")
                .contains("ai.advanced-reasoning.budget-ms");
        int m = s.indexOf("private String tryAdvancedReasoning");
        String body = s.substring(m, Math.min(m + 2600, s.length()));
        assertThat(body).as("必须记录截止时间").contains("deadlineNanos");
        assertThat(body)
                .as("GoT 之后必须检查预算，避免再串行跑一轮 ToT")
                .contains("System.nanoTime() > deadlineNanos");
        // 预算判断必须在 totEngine 调用之前
        int check = body.indexOf("System.nanoTime() > deadlineNanos");
        int tot = body.indexOf("getTreeOfThoughtsEngine");
        assertThat(check).isGreaterThan(0);
        assertThat(tot).isGreaterThan(check);
    }

    @Test
    @DisplayName("⑤ 推理提示必须标注「未经工具核实」——GoT/ToT 是无工具调用")
    void reasoningHintMustBeLabeled() throws Exception {
        String s = orch();
        assertThat(s)
                .as("必须标注未经工具核实")
                .contains("未经工具查询业务数据核实");
        assertThat(s)
                .as("必须要求以工具结果为准，防止把凭空推断当事实")
                .contains("必须以工具查询结果为准");
        // 确认 GoT/ToT 确实以空 context / 空 tools 调用
        assertThat(s)
                .as("GoT 以空 context/tools 调用，属未核实推理")
                .contains("gotEngine.reason(")
                .contains("java.util.Collections.emptyList(), java.util.Collections.emptyList()");
    }

    @Test
    @DisplayName("⑥ 直查只在确定性问题上生效，不得拦走需要推理的问法")
    void directQueryDoesNotHijackReasoning() throws Exception {
        // 复用 DirectQueryRouter 的既有约束：无参直查不含「为什么/怎么办/建议」
        String router = Files.readString(Path.of(
                "src/main/java/com/fashion/supplychain/intelligence/orchestration/DirectQueryRouter.java"),
                StandardCharsets.UTF_8);
        int start = router.indexOf("private DirectAnswer tryNoArgDirect");
        String body = router.substring(start, Math.min(start + 1200, router.length()));
        assertThat(body).doesNotContain("为什么");
        assertThat(body).doesNotContain("怎么办");
        assertThat(body).doesNotContain("建议");
    }
}