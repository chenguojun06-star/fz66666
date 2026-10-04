package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.helper.XiaoyunPatterns;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 小云快路径闸门回归守护（D-702 P0：工具全部没被调用）
 *
 * <p><b>这个测试守护的是一个「看起来正常、实际全错」的生产事实</b>：
 * 86 个工具注册完好、103 个实现类全是真实现、无一个桩 —— 看起来 AI 工具体系健全。
 * 但生产实测：
 * <ul>
 *   <li>成本表里唯一传工具的推理路径 {@code scene='agent-loop'} <b>记录数为 0</b>；</li>
 *   <li>工具执行器的所有<b>执行</b>类日志（工具缓存命中 / 模糊匹配 / 执行异常 /
 *       preToolUse·postToolUse Hook / recordToolCall / logToolCall）<b>全为 0</b>，
 *       而「已注册工具」日志有 104 条 —— 注册了，从没执行过；</li>
 *   <li>「降级到Agent循环」日志同样为 0。</li>
 * </ul>
 *
 * <p><b>根因</b>：流式小云对话先试 {@code QuickPath}，它调用
 * {@code chatStream("ai-advisor", msgs, java.util.List.of())} —— 第三个参数是
 * <b>空工具列表</b>；而闸门 {@code isQuickPathEligible} 结尾有兜底
 * {@code return userMessage.length() <= 100;}，加上 {@code COMPLEX_ANALYSIS} 也直接放行
 * （"查一下…" 恰好命中该pattern），导致几乎所有提问都走空工具通道。
 *
 * <p><b>为什么这是 P0 而不是功能缺失</b>：QuickPath 只有 RAG 知识库 + 页面上下文 + 记忆库，
 * <b>没有业务工具</b>。于是「查一下 BR24001 的进度」「库存多少」会得到一句流利、
 * 但数字来自语言模型推测的回答，完全不碰生产表 —— 违反 CLAUDE.md 铁律 7
 * （禁止伪造业务数据）。假数字会被当真用于经营决策，比功能缺失严重得多。
 */
@DisplayName("小云快路径闸门（D-702 P0：含业务数据的提问不得走无工具快路径）")
class QuickPathToolGateTest {

    /** 通过反射调用 private 方法，避免为测试改动生产可见性 */
    private static boolean eligible(String userMessage) throws Exception {
        Method m = AiAgentOrchestrator.class.getDeclaredMethod("isQuickPathEligible", String.class);
        m.setAccessible(true);
        Object instance = m.getDeclaringClass().getDeclaredConstructor().newInstance();
        return (boolean) m.invoke(instance, userMessage);
    }

    @Test
    @DisplayName("典型业务数据查询必须走 Agent 循环（这是修复的核心）")
    void businessDataQueriesMustNotUseQuickPath() throws Exception {
        // 这些在修复前**全部**返回 true（走空工具通道 → 靠 LLM 推测作答）
        String[] mustUseTools = {
                "查一下BR24001的进度",
                "帮我查订单进度",
                "订单进度怎么样",
                "库存多少",
                "这个月工资发多少",
                "有哪些逾期订单",
                "哪些订单有延期风险",
                "告诉我成本情况",
                "工厂产能排名",
                "对账差异分析",
                "款号BR24XQ0098裁剪了多少",
                "次品率是多少",
                "采购单价查询",
        };
        for (String q : mustUseTools) {
            assertThat(eligible(q))
                    .as("「%s」涉及业务数据，必须进 Agent 循环查库，不能走无工具快路径", q)
                    .isFalse();
        }
    }

    @Test
    @DisplayName("问候与知识问答仍走快路径（不能为了正确性把性能全牺牲掉）")
    void greetingsAndKnowledgeStillUseQuickPath() throws Exception {
        String[] canUseQuickPath = {
                "你好",
                "谢谢",
                "你是谁",
                "辛苦了",
                "扫码流程是怎样的",
                "怎么使用这个功能",
                "入库操作步骤说明",
        };
        for (String q : canUseQuickPath) {
            assertThat(eligible(q))
                    .as("「%s」不需要查业务数据，应保留快路径", q)
                    .isTrue();
        }
    }

    @Test
    @DisplayName("SMALL_TALK 优先于业务词闸门：问候语含「好的/收到」不得被误判成业务查询")
    void smallTalkBeatsBusinessKeywordGate() throws Exception {
        // 「好的」被 GREETING 命中；若无条件先拦业务词会白跑一次工具循环
        assertThat(XiaoyunPatterns.estimateIntent("好的")).isEqualTo(XiaoyunPatterns.IntentType.SMALL_TALK);
        assertThat(eligible("好的")).isTrue();
        assertThat(eligible("收到")).isTrue();
        assertThat(eligible("明白了")).isTrue();
    }

    @Test
    @DisplayName("写操作本就不该走快路径")
    void actionCommandsNeverUseQuickPath() throws Exception {
        assertThat(eligible("帮我做入库单")).isFalse();
        assertThat(eligible("快速建单")).isFalse();
        assertThat(eligible("撤回扫码")).isFalse();
    }

    @Test
    @DisplayName("边界：null / 超长消息不进快路径")
    void boundaryCases() throws Exception {
        assertThat(eligible(null)).isFalse();
        assertThat(eligible("x".repeat(1001))).isFalse();
    }

    /**
     * 把根因固化成断言：意图分类器把"查一下"判成 COMPLEX_ANALYSIS，
     * 而旧闸门对 COMPLEX_ANALYSIS 直接放行 —— 这正是工具被绕过的入口。
     * 若将来有人"优化"意图分类器，这条会提醒同步检查闸门。
     */
    @Test
    @DisplayName("意图分类现状被记录：查一下→COMPLEX_ANALYSIS（旧闸门正是因此放行）")
    void intentClassificationIsKnownAndGuarded() {
        assertThat(XiaoyunPatterns.estimateIntent("查一下BR24001的进度"))
                .as("「查一下」命中 COMPLEX_ANALYSIS；旧闸门对该意图 return true → 无工具通道")
                .isEqualTo(XiaoyunPatterns.IntentType.COMPLEX_ANALYSIS);
        assertThat(XiaoyunPatterns.isBusinessKeyword("查一下BR24001的进度"))
                .as("业务关键词闸门是本次修复的实际拦截点，必须命中")
                .isTrue();
    }
}