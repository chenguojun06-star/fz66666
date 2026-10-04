package com.fashion.supplychain.intelligence.agent.loop;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 防幻觉守卫的 UserContext 回归守护（D-702 P0：四个守卫曾全部静默失效）
 *
 * <p><b>失效链路（生产实测）</b>：
 * <ol>
 *   <li>{@code runDataTruthGuards} 用 {@code CompletableFuture.supplyAsync} 提交四个守卫，
 *       默认跑在 {@code ForkJoinPool.commonPool()}；</li>
 *   <li>该线程不继承请求线程的 ThreadLocal → {@code UserContext.tenantId()} 为空 → 守卫内部
 *       {@code TenantAssert.assertTenantContext()} 抛「操作失败：缺少租户上下文」；</li>
 *   <li>异常被外层 {@code catch} 吞掉并「回退串行」，而串行仍在同一 async-post 线程，
 *       <b>同样没有租户</b> —— 于是数据真实性 / 数字一致性 / 实体事实 / 接地率
 *       <b>四个守卫全部失效</b>，而日志只留下一行 WARN，接口照样 200。</li>
 * </ol>
 *
 * <p>线上同一时刻的旁证：{@code [AgentLoop] 数字一致性校验异常: [AI输出数字 32.0 在工具数据中无匹配]}
 * 与 {@code 并行数据校验异常，回退串行: ...缺少租户...} 先后出现 ——
 * 说明 AI 确实编造了数字，而本该拦住它的守卫自己先崩了。
 *
 * <p><b>为什么用源码断言</b>：这类缺陷在单元测试里极难复现（要构造 ForkJoinPool 线程 + 无租户上下文），
 * 但它的本质是「异步任务必须恢复上下文」这一约定，值得用测试固化，
 * 防止后续维护者把 {@code supplyAsyncWithUserContext} 改回裸 {@code supplyAsync}。
 */
@DisplayName("防幻觉守卫的 UserContext（D-702 P0：守卫曾集体静默失效）")
class DataTruthGuardUserContextTest {

    private static final List<String> CANDIDATES = List.of(
            "src/main/java/com/fashion/supplychain/intelligence/agent/loop/AgentLoopEngine.java",
            "backend/src/main/java/com/fashion/supplychain/intelligence/agent/loop/AgentLoopEngine.java");

    private static Path resolveSource() {
        return CANDIDATES.stream().map(Path::of).filter(Files::exists).findFirst()
                .orElseThrow(() -> new AssertionError("找不到 AgentLoopEngine.java，已尝试: " + CANDIDATES));
    }

    private static String source() throws Exception {
        return Files.readString(resolveSource(), StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("四个守卫必须走带上下文包装的 supplyAsync，不能用裸 supplyAsync")
    void allGuardsUseContextAwareSupplyAsync() throws Exception {
        String s = source();
        int blockStart = s.indexOf("private String runDataTruthGuards(AgentLoopContext ctx, String content)");
        int blockEnd = s.indexOf("private String runDataTruthGuardsFallback", blockStart);
        assertThat(blockStart).as("应存在 runDataTruthGuards").isGreaterThan(0);
        assertThat(blockEnd).as("应存在 runDataTruthGuardsFallback").isGreaterThan(blockStart);

        String parallelBlock = s.substring(blockStart, blockEnd);
        assertThat(parallelBlock)
                .as("并行分支里不得出现裸 supplyAsync（会丢 UserContext）")
                .doesNotContain("CompletableFuture.supplyAsync(");

        // 四个守卫逐一确认走包装方法
        assertThat(parallelBlock).contains("supplyAsyncWithUserContext(ctx, () -> dataTruthGuard.checkAiOutputTruth");
        assertThat(parallelBlock).contains("supplyAsyncWithUserContext(ctx, () -> dataTruthGuard.checkNumericConsistency");
        assertThat(parallelBlock).contains("supplyAsyncWithUserContext(ctx, () -> entityFactChecker.verifyEntities");
        assertThat(parallelBlock).contains("supplyAsyncWithUserContext(ctx, () -> groundedGenerationGuard.verify");
    }

    @Test
    @DisplayName("包装方法必须 set 后复原 UserContext（ThreadLocal 复用线程，不复原会污染后续任务）")
    void wrapperSetsAndRestoresUserContext() throws Exception {
        String s = source();
        int start = s.indexOf("private <T> java.util.concurrent.CompletableFuture<T> supplyAsyncWithUserContext");
        assertThat(start).as("应存在 supplyAsyncWithUserContext 包装方法").isGreaterThan(0);
        String method = s.substring(start, Math.min(start + 1400, s.length()));
        assertThat(method).contains("UserContext.get()");
        assertThat(method).contains("UserContext.set(asyncCtx)");
        assertThat(method).contains("finally");
        assertThat(method).as("必须在 finally 里复原").contains("UserContext.set(previous)");
    }

    @Test
    @DisplayName("串行回退也必须恢复上下文：它跑在 async-post 线程，同样没有租户")
    void fallbackAlsoRestoresUserContext() throws Exception {
        String s = source();
        int start = s.indexOf("private String runDataTruthGuardsFallback(AgentLoopContext ctx, String content)");
        assertThat(start).as("应存在 runDataTruthGuardsFallback").isGreaterThan(0);
        String method = s.substring(start, Math.min(start + 900, s.length()));
        assertThat(method)
                .as("「回退串行」不等于「有上下文」，串行也在异步线程")
                .contains("UserContext.set(asyncCtx)")
                .contains("UserContext.set(fallbackPrevious)");
    }

    /**
     * getNow(默认值) 的默认参数是 eager 求值：写 getNow(check(...)) 会让每个守卫跑两遍，
     * 且默认值里再抛一次租户异常，把本可成功的并行路径直接推去回退串行。
     */
    @Test
    @DisplayName("取结果用 join()，不得用 getNow(重新执行校验) ")
    void usesJoinNotGetNowWithEagerDefault() throws Exception {
        String s = source();
        int start = s.indexOf("private String runDataTruthGuards(AgentLoopContext ctx, String content)");
        int end = s.indexOf("private String runDataTruthGuardsFallback", start);
        String block = s.substring(start, end);
        assertThat(block)
                .as("getNow(x.check(...)) 的默认值每次都会被求值，等于校验跑两遍且可能再抛异常")
                .doesNotContain("getNow(dataTruthGuard")
                .doesNotContain("getNow(entityFactChecker")
                .doesNotContain("getNow(groundedGenerationGuard");
        assertThat(block).contains("truthF.join()").contains("numF.join()");
    }
}