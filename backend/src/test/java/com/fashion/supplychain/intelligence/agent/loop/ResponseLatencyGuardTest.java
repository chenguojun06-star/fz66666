package com.fashion.supplychain.intelligence.agent.loop;

import com.fashion.supplychain.intelligence.agent.router.SemanticDomainRouter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 交互延迟回归守护（D-702 性能）
 *
 * <p><b>问题来源是用户反馈</b>：「回答速度太慢，人员点击就可以看，远远不够人员去点击查看来的更快」。
 * 用生产全链路日志量化一次真实提问（2026-10-05 20:34:17 → 20:35:24，合计约 66s），
 * 而 AgentLoop 自己记录的 latency_ms 仅 4.8s —— <b>差额 90% 花在回答之前的同步阻塞步骤上</b>：
 *
 * <pre>
 *   DAG 规划 + 工具预选  +13.2s   ← 3 次串行 LLM，纯前置开销
 *   iter=1（发起3工具）    +2.4s
 *   iter=2（生成答案）    +20.8s   ← 轮数上限被多域逻辑推高
 *   SelfCritic + 守卫      +15s    （异步，不阻塞返回）
 * </pre>
 *
 * <p>本次四处优化都遵循同一条原则：<b>可选项不得阻塞主链路，数据链路绝不受影响</b>。
 * 被砍掉的 DAG 规划、领域 LLM 分类，都只是「注入的提示」，
 * 失败或超时只少一段提示，**不影响工具选择、不影响数据准确性、不影响事务**。
 */
@DisplayName("交互延迟（D-702 性能：66s 全链路 vs 4.8s 实际推理）")
class ResponseLatencyGuardTest {

    private static final List<String> BUILDER_CANDIDATES = List.of(
            "src/main/java/com/fashion/supplychain/intelligence/agent/loop/AgentLoopContextBuilder.java",
            "backend/src/main/java/com/fashion/supplychain/intelligence/agent/loop/AgentLoopContextBuilder.java");
    private static final List<String> DAG_CANDIDATES = List.of(
            "src/main/java/com/fashion/supplychain/intelligence/upgrade/phase3/IntentDrivenDagService.java",
            "backend/src/main/java/com/fashion/supplychain/intelligence/upgrade/phase3/IntentDrivenDagService.java");
    private static final List<String> ROUTER_CANDIDATES = List.of(
            "src/main/java/com/fashion/supplychain/intelligence/agent/router/SemanticDomainRouter.java",
            "backend/src/main/java/com/fashion/supplychain/intelligence/agent/router/SemanticDomainRouter.java");

    private static String read(List<String> c) throws Exception {
        for (String p : c) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到文件: " + c);
    }

    @Test
    @DisplayName("① 领域路由只算一次：不得再连续调 route/routeMulti/isMultiDomain")
    void domainRoutingComputedOnce() throws Exception {
        String s = read(BUILDER_CANDIDATES);
        int routeMulti = countOccurrences(s, "domainRouter.routeMulti(");
        assertThat(routeMulti)
                .as("三行连续调用（route 内部还嵌套 routeMulti）会让新问题重复跑 LLM 分类，"
                        + "缓存对新问题必然 miss，等于白白多等几秒")
                .isEqualTo(1);
        assertThat(s)
                .as("route() 内部就是取 routeMulti 的首个域，已改为直接派生")
                .doesNotContain("domainRouter.route(userMessage)");
        assertThat(s)
                .as("isMultiDomain 应由 domains.size() 派生，不再单独调用")
                .doesNotContain("domainRouter.isMultiDomain(");
    }

    @Test
    @DisplayName("① 关键词命中即可跳过 LLM 领域分类，但兜底 GENERAL 不得跳过")
    void keywordRoutingSkipsLlmButNotForFallback() throws Exception {
        String s = read(ROUTER_CANDIDATES);
        assertThat(s).contains("shouldSkipLlmRouting");
        assertThat(s)
                .as("跳过条件必须排除「仅 GENERAL」——那是没匹配到业务词的兜底，等于没命中")
                .contains("ToolDomain.GENERAL");
        int start = s.indexOf("private boolean shouldSkipLlmRouting");
        assertThat(start).as("应存在跳过判定方法").isGreaterThan(0);
        String m = s.substring(start, Math.min(start + 1000, s.length()));
        assertThat(m).contains("keywordConfidenceThreshold").contains("keywordSkipLlmMinDomains");
    }

    @Test
    @DisplayName("② DAG 规划必须有超时护栏：它只是可选提示，不得拖慢主链路")
    void dagPlanningHasTimeoutGuard() throws Exception {
        String s = read(DAG_CANDIDATES);
        assertThat(s)
                .as("实测该步骤阻塞 10.4s，曾是裸同步 chat() 无任何超时")
                .contains("planTimeoutMs")
                .contains("TimeoutException");
        assertThat(s)
                .as("超时必须降级为「不用 DAG 规划」而非让请求失败")
                .contains("降级为不使用 DAG 规划");
    }

    @Test
    @DisplayName("② 超时执行器必须是单例守护线程池：内联创建会每次泄漏一个线程池")
    void dagExecutorIsSingletonDaemon() throws Exception {
        String s = read(DAG_CANDIDATES);
        assertThat(s)
                .as("Executors.newSingleThreadExecutor 内联创建且从不 shutdown → 线程持续堆积，"
                        + "提速反而变泄漏")
                .contains("static final java.util.concurrent.ExecutorService PLAN_EXECUTOR")
                .contains("setDaemon(true)");
    }

    @Test
    @DisplayName("③ 多域提升轮数幅度收敛：每域 +1 而非 +2，且硬上限 5")
    void maxIterationsBounded() throws Exception {
        String s = read(BUILDER_CANDIDATES);
        assertThat(s)
                .as("每域 +2 会把 3 轮推到 5~7 轮，而每轮都是一次同步 LLM 往返")
                .contains("int extraIterations = Math.max(0, multiDomains.size() - 1);");
        assertThat(s)
                .as("硬上限 10 意味着最坏要跑 10 遍同步 LLM，对交互式问答不可接受")
                .contains("xiaoyun.agent.max-iterations-hard-limit:5");
    }

    @Test
    @DisplayName("④ 优化不得触碰数据正确性：工具过滤与领域裁剪链路必须完整保留")
    void dataPathUntouched() throws Exception {
        String s = read(BUILDER_CANDIDATES);
        assertThat(s)
                .as("工具可见性/领域裁剪/意图预选是数据正确性链路，一次都不能少")
                .contains("resolveVisibleTools")
                .contains("filterByDomains")
                .contains("toolAdvisor.advise")
                .contains("toToolLookup");
        // 工具预选必须仍在：它决定模型能看到哪些工具，直接影响答案是否来自真实数据
        assertThat(s).contains("visibleApiTools");
    }

    private static int countOccurrences(String s, String token) {
        int n = 0, idx = 0;
        while ((idx = s.indexOf(token, idx)) >= 0) {
            n++;
            idx += token.length();
        }
        return n;
    }
}