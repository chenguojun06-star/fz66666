package com.fashion.supplychain.intelligence.orchestration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-755：直查必须只看「用户原话」，不得被 question 里的上下文劫持。
 *
 * <p><b>事故现场</b>：PC 端小云停在「生产管理模块」页时，任意问题 ——
 * 订单号 {@code PO20260901172615}、{@code 什么情况}、快捷按钮 —— 全部返回同一条
 * 「今日样本不足（0 条），但仍发现 2 项异常…」异常检测卡片。
 *
 * <p><b>根因</b>：前端 {@code buildContextualText()} 把<b>两件不同的事</b>拼进同一个 question：
 * 用户原话 + 给 LLM 的提示（页面快捷建议 / 历史摘要）。直查判定是「包含关键词」的松散正则，
 * 在这整段上匹配 → 该页前 3 条建议里正好有「检测生产异常」（前端只取 {@code slice(0,3)}），
 * 于是「停在哪个页面」决定了「问什么都被劫持」。
 *
 * <p><b>为什么上一轮的测试没拦住</b>：{@link NoArgDirectQueryTest} 全是<b>源码字符串断言</b>
 * （读 .java 文本断言 {@code contains("tool_anomaly_detection")}），
 * {@link DirectQueryRouterTest} 只喂干净短句。两者断言的都是「代码里有没有这行」，
 * 而不是「给定这个输入会不会命中」—— 这类回归结构上就测不出来。
 *
 * <p>所以本类只做一件事：<b>用真实 blob 做行为断言</b>。
 * 拼装逻辑刻意与 {@code helpers.ts#buildContextualText} 逐段对齐（含 emoji，与线上字符串一致）。
 */
@DisplayName("D-755：直查只看用户原话（上下文不得劫持）")
class DirectQueryContextIsolationTest {

    /**
     * 与前端 {@code buildContextualText()} 同构地拼出 question。
     *
     * <p>真实拼接顺序：
     * {@code [当前页面:…|URL参数][工厂ID:… 工厂名:…] 原话\n[页面快捷操作建议：前3条]\n[历史对话摘要：…]}
     */
    private static String buildQuestion(String pageLabel, String urlParams, String rawText,
            String[] suggestions, String... historyUserMsgs) {
        StringBuilder sb = new StringBuilder();
        sb.append("[当前页面:").append(pageLabel);
        if (urlParams != null && !urlParams.isEmpty()) {
            sb.append(" | ").append(urlParams);
        }
        sb.append("][工厂ID:F001 工厂名:测试工厂] ").append(rawText);
        if (suggestions != null && suggestions.length > 0) {
            sb.append("\n[页面快捷操作建议：")
                    .append(String.join("；", Arrays.copyOf(suggestions, Math.min(3, suggestions.length))))
                    .append("]");
        }
        if (historyUserMsgs.length > 0) {
            sb.append("\n[历史对话摘要：").append(String.join(" | ", historyUserMsgs)).append("...]");
        }
        return sb.toString();
    }

    /** 线上真实建议清单（routeConfig.ts，与生产环境逐字一致） */
    private static final String[] SUGGESTIONS_PRODUCTION = {
            "🏭 查看今日生产进度", "📅 预测订单交期", "🔍 检测生产异常", "📊 排产建议",
            "⚡ 紧急订单有哪些", "📉 逾期风险分析"};
    private static final String[] SUGGESTIONS_WAREHOUSING = {
            "📦 今日入库多少", "🔍 入库异常检测", "📊 入库效率统计", "⚠️ 质检合格率怎样"};
    private static final String[] SUGGESTIONS_FINANCE = {
            "💰 工资成本分析", "📊 对账异常检测", "📈 利润估算", "🧾 费用报销统计", "💵 本月支出多少"};

    /** 用户在事故里实际发过的问题，全都不含任何异常类关键词 */
    private static final String[] USER_QUESTIONS = {
            "PO20260901172615", "⚡ 紧急订单有哪些", "🏭 查看今日生产进度", "什么情况", "你会什么啊"};

    @Test
    @DisplayName("① 生产管理页 + 任意问题 → 不得命中异常直查（事故核心）")
    void productionPageMustNotHijack() {
        for (String q : USER_QUESTIONS) {
            String question = buildQuestion("生产管理模块", null, q, SUGGESTIONS_PRODUCTION,
                    "有没有异常", "检测今日异常");

            String isolated = DirectQueryRouter.extractUserQuestion(question);
            assertThat(isolated)
                    .as("必须还原出用户原话，而不是整段上下文")
                    .isEqualTo(q);
            assertThat(DirectQueryRouter.detectNoArgTool(isolated))
                    .as("原话「%s」不含异常类关键词，绝不能命中无参直查", q)
                    .isNull();
        }
    }

    @Test
    @DisplayName("② 三个带毒页面的前 3 条建议都不得劫持直查")
    void allPoisonedPagesAreIsolated() {
        String[][] pages = {
                {"生产管理模块", "🔍 检测生产异常"},
                {"成品入库", "🔍 入库异常检测"},
                {"财务管理", "📊 对账异常检测"},
        };
        String[][] suggestions = {SUGGESTIONS_PRODUCTION, SUGGESTIONS_WAREHOUSING, SUGGESTIONS_FINANCE};

        for (int i = 0; i < pages.length; i++) {
            for (String q : USER_QUESTIONS) {
                String question = buildQuestion(pages[i][0], null, q, suggestions[i]);
                assertThat(DirectQueryRouter.detectNoArgTool(
                        DirectQueryRouter.extractUserQuestion(question)))
                        .as("%s 页的建议含「%s」，但原话是「%s」，不得命中", pages[i][0], pages[i][1], q)
                        .isNull();
            }
        }
    }

    @Test
    @DisplayName("③ 历史摘要里的异常字样不得劫持（否则中毒会扩散到所有页面）")
    void historyHintMustNotHijack() {
        String question = buildQuestion("首页", null, "什么情况", null,
                "有没有异常", "帮我检测一下异常");
        assertThat(DirectQueryRouter.extractUserQuestion(question)).isEqualTo("什么情况");
        assertThat(DirectQueryRouter.detectNoArgTool(DirectQueryRouter.extractUserQuestion(question)))
                .as("历史里问过异常 ≠ 现在在问异常")
                .isNull();
    }

    @Test
    @DisplayName("④ 合法问法仍必须命中（防止修过头，把正常功能也关掉）")
    void legitimateQuestionsStillHit() {
        assertThat(DirectQueryRouter.detectNoArgTool("有没有异常")).isEqualTo("tool_anomaly_detection");
        assertThat(DirectQueryRouter.detectNoArgTool("生产异常")).isEqualTo("tool_anomaly_detection");
        assertThat(DirectQueryRouter.detectNoArgTool("帮我看看有没有对不上的")).isEqualTo("tool_finance_anomaly");
        assertThat(DirectQueryRouter.detectNoArgTool("费用异常")).isEqualTo("tool_finance_anomaly");
        // 财务问法必须优先命中财务工具：「财务有没有问题」同时能被生产异常正则的
        // 「有没有问题」命中，若生产异常先判，用户问财务会拿到「今日生产异常检测」卡片。
        assertThat(DirectQueryRouter.detectNoArgTool("财务有没有问题")).isEqualTo("tool_finance_anomaly");
        assertThat(DirectQueryRouter.detectNoArgTools("财务异常检测"))
                .as("两者都能命中时，财务必须排前面")
                .containsExactly("tool_finance_anomaly", "tool_anomaly_detection");
        // 从带毒页面问出来的「检测生产异常」本身仍然要能命中
        assertThat(DirectQueryRouter.detectNoArgTool(
                DirectQueryRouter.extractUserQuestion(
                        buildQuestion("生产管理模块", null, "🔍 检测生产异常", SUGGESTIONS_PRODUCTION))))
                .isEqualTo("tool_anomaly_detection");
    }

    @Test
    @DisplayName("⑤ 订单号必须取用户原话里的那个，而不是页面 URL 里的（防止报错单的数据）")
    void orderNoComesFromUserNotUrl() {
        String question = buildQuestion("生产订单详情", "orderNo:PO20260901172615",
                "PO99999999 进度到哪了", null);

        // 修复前的天真做法：直接在整段上 find → 取到 URL 里那个（用户明确指定的被忽略）
        assertThat(DirectQueryRouter.extractOrderNo(question))
                .as("这正是必须隔离的原因：整段上取第一个匹配会取到 URL 的单号")
                .isEqualTo("PO20260901172615");

        assertThat(DirectQueryRouter.extractOrderNo(DirectQueryRouter.extractUserQuestion(question)))
                .as("隔离后必须取用户手打的单号")
                .isEqualTo("PO99999999");
    }

    @Test
    @DisplayName("⑥ 历史摘要内含右方括号时仍能正确截断（不能按方括号配对剥离）")
    void historyContainingBracketStillStripsCleanly() {
        String question = buildQuestion("首页", null, "PO20260901172615 好了吗", null,
                "帮我看下 [A类] 这单", "有没有异常");
        assertThat(DirectQueryRouter.extractUserQuestion(question))
                .as("历史里的 ']' 不得影响截断位置")
                .isEqualTo("PO20260901172615 好了吗");
    }

    @Test
    @DisplayName("⑦ 前置页面/工厂前缀必须剥掉，且不影响正常短句")
    void stripsLeadingPrefixes() {
        assertThat(DirectQueryRouter.extractUserQuestion(
                "[当前页面:生产管理模块|orderNo:PO20260901172615][工厂ID:F001 工厂名:测试工厂] 什么情况"))
                .isEqualTo("什么情况");
        assertThat(DirectQueryRouter.extractUserQuestion("什么情况")).isEqualTo("什么情况");
        assertThat(DirectQueryRouter.extractUserQuestion(null)).isNull();
    }

    /**
     * 前端两个按钮的<b>真实文案</b>必须命中快路径。
     *
     * <p>{@code routeConfig.ts:147}「🔍 检测今日异常」与 {@code GlobalSearchModal.tsx:46}
     * 「查看今日异常」此前都不在词表里（词表只有「生产异常」，那对应的是另一个按钮
     * 「🔍 检测生产异常」）→ 点「检测今日异常」永远落到 Agent 循环，白等 1~3 分钟。
     */
    @Test
    @DisplayName("⑧ 按钮文案「检测今日异常」「查看今日异常」必须命中快路径")
    void todayAnomalyButtonsMustHitFastPath() {
        String[] shouldHit = {
                "🔍 检测今日异常", "查看今日异常", "今日异常",
                "🔍 检测生产异常", "异常检测", "今天有什么问题",
        };
        for (String q : shouldHit) {
            assertThat(DirectQueryRouter.detectNoArgTool(q))
                    .as("「%s」应命中异常直查", q)
                    .isEqualTo("tool_anomaly_detection");
        }

        // 反向：不得因为新增「今日异常」而误伤普通问法
        String[] mustNotHit = {
                "今天生产了多少件", "今日入库多少", "这个订单什么时候交",
                "帮我查下PO20260901172615", "🏭 查看今日生产进度",
        };
        for (String q : mustNotHit) {
            assertThat(DirectQueryRouter.detectNoArgTool(q))
                    .as("「%s」不含异常关键词，不得命中", q)
                    .isNull();
        }
    }
}
