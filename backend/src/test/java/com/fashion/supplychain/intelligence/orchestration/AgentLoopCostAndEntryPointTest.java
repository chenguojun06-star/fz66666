package com.fashion.supplychain.intelligence.orchestration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 三处「静默失真」回归守护（D-702 P0 收尾）
 *
 * <p>前两个提交打通了「问题进得去 Agent 循环」与「工具确实被执行」。本守护覆盖全量审计
 * 剩下的三处遗漏，性质都是<b>不报错、不崩溃、只是结果不可信</b>：
 *
 * <ol>
 *   <li><b>成本归因被随机数污染</b>：质量重试把 {@code ctx.getCommandId()}（16 位随机 UUID）
 *       当作 scene 传入推理，于是每一次重试都在 {@code t_ai_cost_tracking} 里写出
 *       一个全新「场景」——按 scene 聚合成本时彻底失真，一个会话一个场景。
 *       这条直接损害「钱花在哪」的归因能力（D-700 已在该领域栽过一次）。</li>
 *   <li><b>同步/流式能力不对称</b>：流式侧多 Agent 图有开关保护（默认 false），
 *       同步侧<b>无条件</b>路由。而图里的 Specialist 走三参数 chat（tools=null）拿不到工具，
 *       于是同一句业务问题在 PC 上会查库、在飞书/钉钉/微信上只能拿硬编码窗口的快照。</li>
 *   <li><b>兜底编造数据</b>：本地 handler 全未命中后，把固定几个概况数字喂给无工具的
 *       {@code aiAdvisorService}，而用户问的往往是概况里根本没有的数据 —— 无工具 + 无数据
 *       = 只能编，违反 CLAUDE.md 铁律 7。</li>
 * </ol>
 */
@DisplayName("成本归因与入口一致性（D-702 P0 收尾三处静默失真）")
class AgentLoopCostAndEntryPointTest {

    private static final List<String> LOOP_CANDIDATES = List.of(
            "src/main/java/com/fashion/supplychain/intelligence/agent/loop/AgentLoopEngine.java",
            "backend/src/main/java/com/fashion/supplychain/intelligence/agent/loop/AgentLoopEngine.java");
    private static final List<String> ORCH_CANDIDATES = List.of(
            "src/main/java/com/fashion/supplychain/intelligence/orchestration/AiAgentOrchestrator.java",
            "backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/AiAgentOrchestrator.java");
    private static final List<String> NLQ_CANDIDATES = List.of(
            "src/main/java/com/fashion/supplychain/intelligence/orchestration/NlQueryDataHandlers.java",
            "backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/NlQueryDataHandlers.java");

    private static String read(List<String> candidates) throws Exception {
        for (String c : candidates) {
            Path p = Path.of(c);
            if (Files.exists(p)) return Files.readString(p, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到文件: " + candidates);
    }

    /**
     * 从方法签名处截取到**下一个方法定义**为止，避免用固定字符窗口 ——
     * 方法前的长注释会让固定窗口截不到真正要断言的那几行。
     */
    private static String methodBody(String src, String signature) {
        int start = src.indexOf(signature);
        assertThat(start).as("应存在方法: %s", signature).isGreaterThan(0);
        int next = src.indexOf("\n    private ", start + signature.length());
        int nextPub = src.indexOf("\n    public ", start + signature.length());
        if (next < 0) next = src.length();
        if (nextPub > 0 && nextPub < next) next = nextPub;
        return src.substring(start, next);
    }

    @Test
    @DisplayName("① 质量重试必须用固定 scene，禁止把随机 commandId 当场景")
    void qualityRetryMustNotUseRandomCommandIdAsScene() throws Exception {
        String s = read(LOOP_CANDIDATES);
        String method = methodBody(s, "private String retryWithQualityFeedback");

        assertThat(method)
                .as("commandId 是 16 位随机 UUID，当 scene 会让成本表每次多出一个新场景")
                .doesNotContain("ctx.getCommandId(),\n                    \"你是服装供应链AI助手");
        assertThat(method).contains("agent-loop:quality-retry");
    }

    @Test
    @DisplayName("① 质量重试所在方法不得用 commandId 作 scene 首参")
    void noOtherCommandIdAsScene() throws Exception {
        String s = read(LOOP_CANDIDATES);
        String method = methodBody(s, "private String retryWithQualityFeedback");
        int chatIdx = method.indexOf("inferenceGateway.chat(");
        assertThat(chatIdx).as("应调用推理").isGreaterThan(0);
        String callArgs = method.substring(chatIdx, Math.min(chatIdx + 120, method.length()));
        assertThat(callArgs)
                .as("chat 的首参是 scene，不得是随机 commandId")
                .doesNotContain("ctx.getCommandId()");
    }

    @Test
    @DisplayName("② 同步侧多 Agent 图必须有开关，且默认关闭")
    void syncMultiAgentGraphIsGated() throws Exception {
        String s = read(ORCH_CANDIDATES);
        assertThat(s)
                .as("同步侧开关缺失会导致 IM/微信/OpenAI 兼容入口默认进无工具的多 Agent 图")
                .contains("xiaoyun.agent.multi-agent-graph-sync.enabled:false")
                .contains("multiAgentGraphSyncEnabled");

        String method = methodBody(s, "private Result<String> tryRouteToMultiAgentGraph(String userMessage");
        assertThat(method)
                .as("必须在路由之前先判开关并 return null")
                .contains("if (!multiAgentGraphSyncEnabled)")
                .contains("return null;");
    }

    @Test
    @DisplayName("② 流式与同步两侧开关都默认为 false，保持能力一致")
    void bothGraphPathsDefaultOff() throws Exception {
        String s = read(ORCH_CANDIDATES);
        assertThat(s).contains("xiaoyun.agent.multi-agent-graph-streaming.enabled:false");
        assertThat(s).contains("xiaoyun.agent.multi-agent-graph-sync.enabled:false");
    }

    @Test
    @DisplayName("③ NLQuery 兜底必须优先走带工具的 Agent 主循环")
    void nlQueryFallbackPrefersAgentLoop() throws Exception {
        String s = read(NLQ_CANDIDATES);
        String method = methodBody(s, "public NlQueryResponse handleAiDeepFallback");

        assertThat(method)
                .as("handler 全未命中时，用户问的数据概况里根本没有；必须让模型自己查库")
                .contains("aiAgentOrchestrator.executeAgent")
                .contains("agent_tool_grounded");
        assertThat(method)
                .as("保留原路径作为最后一级降级")
                .contains("aiAdvisorService.chat(sys, question)");
        assertThat(method.indexOf("aiAgentOrchestrator.executeAgent"))
                .as("Agent 工具链必须在概况 AI 兜底之前")
                .isLessThan(method.indexOf("aiAdvisorService.chat(sys, question)"));
    }

    @Test
    @DisplayName("③ 循环依赖风险：Agent 链必须 @Lazy 注入")
    void agentDependencyMustBeLazy() throws Exception {
        String s = read(NLQ_CANDIDATES);
        int idx = s.indexOf("AiAgentOrchestrator aiAgentOrchestrator");
        assertThat(idx).as("应注入 AiAgentOrchestrator").isGreaterThan(0);
        String around = s.substring(Math.max(0, idx - 260), idx + 40);
        assertThat(around)
                .as("orchestrator 间互相引用存在循环依赖风险，需 @Lazy 打断")
                .contains("@Lazy");
    }
}