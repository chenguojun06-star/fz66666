package com.fashion.supplychain.intelligence.orchestration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 流式 usage 采集回归守护（D-702）
 *
 * <p><b>这个测试守护的是一个「静默失效」</b>：字段加了、列加了、接口挂了，
 * 线上却一行动态数据都采不到 —— 表里 cache 两列全是 0，看起来像「缓存没生效」，
 * 实际是**根本没采集**。若没有这个测试，下一个人很容易把 0 解读成业务结论。
 *
 * <p>两个叠加缺陷（缺一不可，缺任一个都采不到数据）：
 * <ol>
 *   <li>请求体未开 {@code stream_options.include_usage} → DeepSeek 流式完全不返回 usage；</li>
 *   <li>即便开了，携带 usage 的 chunk 其 {@code choices} 是<b>空数组</b>，
 *       而原代码「choices 为空就 return」位于 usage 提取之前 → 整块被丢弃。</li>
 * </ol>
 * 旧注释里「流式响应的 usage 在 SSE 增量里拿不到准数」正是被这两个缺陷误导的产物。
 */
@DisplayName("流式 usage 采集（D-702：表里全是 0，其实是根本没采到）")
class StreamingUsageCollectionTest {

    private static final List<String> CANDIDATES = List.of(
            "src/main/java/com/fashion/supplychain/intelligence/orchestration/IntelligenceInferenceOrchestrator.java",
            "backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/IntelligenceInferenceOrchestrator.java");

    /** surefire 工作目录是 backend/，但从仓库根跑脚本时是 backend/ 的父目录，故两个路径都试 */
    private static Path resolveSource() {
        return CANDIDATES.stream().map(Path::of).filter(Files::exists).findFirst()
                .orElseThrow(() -> new AssertionError("找不到源文件，已尝试: " + CANDIDATES));
    }

    private static String source() throws Exception {
        return Files.readString(resolveSource(), StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("请求体必须开 stream_options.include_usage，否则流式根本不返回 usage")
    void requestEnablesIncludeUsage() throws Exception {
        String s = source();
        assertThat(s)
                .as("DeepSeek 流式默认不返回 usage，必须显式开 include_usage")
                .contains("stream_options")
                .contains("include_usage");
    }

    @Test
    @DisplayName("usage 提取必须在「choices 为空就 return」之前（否则 usage chunk 被整块丢弃）")
    void usageParsedBeforeChoicesGuard() throws Exception {
        String s = source();
        int usageIdx = s.indexOf("acc.usageReceived = true;");
        int guardIdx = s.indexOf("if (!choices.isArray() || choices.isEmpty()) return;");

        assertThat(usageIdx).as("应存在 usage 采集代码").isGreaterThan(0);
        assertThat(guardIdx).as("应存在 choices 判空守卫").isGreaterThan(0);
        assertThat(usageIdx)
                .as("usage 采集必须在 choices 判空守卫之前；带 usage 的 chunk 的 choices 是空数组，顺序反了永远采不到")
                .isLessThan(guardIdx);
    }

    @Test
    @DisplayName("四个 usage 字段都要落到 accumulator，缺一则该维度恒为 0")
    void accumulatorCarriesAllUsageFields() throws Exception {
        String s = source();
        assertThat(s)
                .as("缓存命中率与成本都需要这四个字段")
                .contains("realPromptTokens")
                .contains("realCompletionTokens")
                .contains("realCacheHitTokens")
                .contains("realCacheMissTokens");
    }

    @Test
    @DisplayName("记账走真实 usage，缺失时才回退估算（旧注释断言流式拿不到准数，已被证伪）")
    void accountingPrefersRealUsageOverEstimate() throws Exception {
        String s = source();
        assertThat(s)
                .as("finalizeStreamResult 必须按 usageReceived 分支选择口径")
                .contains("if (acc.usageReceived)")
                .contains("promptForAccounting")
                .contains("completionForAccounting");
        // 旧的不实断言不能留着误导后人
        assertThat(s)
                .as("「流式拿不到准数」已被 include_usage 证伪，注释须更正")
                .doesNotContain("流式响应的 usage 在 SSE 增量里拿不到准数");
    }

    @Test
    @DisplayName("流式与非流式两条路径都要写缓存字段，不能只改一条")
    void bothPathsCollectCacheTokens() throws Exception {
        List<String> lines = Files.readAllLines(resolveSource(), StandardCharsets.UTF_8);
        long setters = lines.stream()
                .filter(l -> l.contains("setPromptCacheHitTokens(") || l.contains("setPromptCacheMissTokens("))
                .count();
        assertThat(setters)
                .as("非流式 + 流式两条路径都要有缓存字段写入（共 4 处）")
                .isGreaterThanOrEqualTo(4);
    }
}