package com.fashion.supplychain.intelligence.helper;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * D-873：计数类问句的轮次压缩守护。
 *
 * <p>生产实证（2026-10-25 01:07）：「延期的有多少」跑满 5 轮耗时 66 秒，
 * 而第 1 轮工具就已拿到数字——后 4 轮全是重复求证。本组用例锁死：
 * 计数问句压到 2 轮，分析/写操作/长复合句一律不压。
 */
class XiaoyunPatternsCountingQuestionTest {

    @Test
    @DisplayName("计数问句 → 2 轮（查一次 + 收尾一次）")
    void countingQuestionsCompressed() {
        assertThat(XiaoyunPatterns.estimateMaxIterations("延期的有多少")).isEqualTo(2);
        assertThat(XiaoyunPatterns.estimateMaxIterations("还有多少订单没完成")).isEqualTo(2);
        assertThat(XiaoyunPatterns.estimateMaxIterations("库存还有几件")).isEqualTo(2);
        assertThat(XiaoyunPatterns.estimateMaxIterations("待处理的有几个")).isEqualTo(2);
    }

    @Test
    @DisplayName("含写操作的句子不压：原设计走 COMPLEX_OP → 6 轮，isCountingQuestion 直接 false")
    void writeOperationsNotCompressed() {
        // 这两个句子都含写操作词：不被压到 2 轮（落到默认 3 或被 COMPLEX_OP 提到 6）。
        // 关键断言是 isCountingQuestion=false——它证明 WRITE_OP 第二道防线真的在拦。
        // estimateMaxIterations 对 <8 字符短句另有早退（返回 2），所以这里用 ≥8 字句子。
        assertThat(XiaoyunPatterns.estimateMaxIterations("删除多少条历史记录")).isEqualTo(3);
        // 「有多少订单需要审核」：没有 WRITE_OP 这道防线，这句会被 isCountingQuestion 压成 2
        assertThat(XiaoyunPatterns.estimateMaxIterations("有多少订单需要审核")).isEqualTo(3);
        // WRITE_OP 是第二道防线：即使某写操作词不在 COMPLEX_OP 里，也不会被计数问句规则压到 2
        assertThat(XiaoyunPatterns.isCountingQuestion("删除多少条历史记录")).isFalse();
        assertThat(XiaoyunPatterns.isCountingQuestion("有多少订单需要审核")).isFalse();
        assertThat(XiaoyunPatterns.isCountingQuestion("同步多少库存到线上店铺")).isFalse();
    }

    @Test
    @DisplayName("分析与复杂问题轮次不受影响")
    void analysisNotCompressed() {
        assertThat(XiaoyunPatterns.estimateMaxIterations("分析一下这个月为什么延期这么多")).isEqualTo(4);
        assertThat(XiaoyunPatterns.estimateMaxIterations("为什么这个订单一直没进度")).isEqualTo(4);
    }

    @Test
    @DisplayName("isCountingQuestion 边界：空/超长/无计数词")
    void countingBoundaries() {
        assertThat(XiaoyunPatterns.isCountingQuestion(null)).isFalse();
        assertThat(XiaoyunPatterns.isCountingQuestion("")).isFalse();
        assertThat(XiaoyunPatterns.isCountingQuestion("你好")).isFalse();
        assertThat(XiaoyunPatterns.isCountingQuestion("帮我看看这个订单的情况")).isFalse();
        // 超长（>60字）不压：通常是复合分析
        String longMsg = "把" + "所有延期".repeat(10) + "的订单数量统计一下";
        assertThat(XiaoyunPatterns.isCountingQuestion(longMsg)).isFalse();
    }
}
