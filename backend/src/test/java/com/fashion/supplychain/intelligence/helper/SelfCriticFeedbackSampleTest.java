package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.intelligence.entity.IntelligenceFeedbackRecord;
import com.fashion.supplychain.intelligence.mapper.IntelligenceFeedbackRecordMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * D-768：SelfCritic 必须记录<b>全部</b>评分（补分母），且不得污染既有消费者。
 *
 * <p><b>问题</b>：{@code autoSaveFeedback} 此前只在 {@code overallScore < 75} 时被调用 →
 * {@code t_intelligence_feedback} 里<b>只有失败样本、没有分母</b>，
 * 算出来的「平均 47.2 分」必然偏低，无法据此判断回答质量是否真的下降。
 *
 * <p><b>约束</b>：这张表被多个学习闭环消费，且它们的分支条件是
 * {@code feedback_result}（{@code rejected} / {@code accepted}）：
 * <ul>
 *   <li>{@code PromptContextProvider.buildSelfCritiqueContext} —— {@code eq("feedback_result","rejected")}</li>
 *   <li>{@code LearningLoopOrchestrator} 归因聚合 —— 内存里 filter {@code "rejected".equals(...)}</li>
 * </ul>
 * 所以「补分母」<b>不能</b>把高分也写成 {@code rejected}，必须另设取值。
 *
 * <p>本类用<b>行为断言</b>（反射调用私有方法 + 捕获 insert 参数），而不是读源码
 * {@code contains(...)} —— 后者测不出「给定这个输入会写出什么」。
 */
@DisplayName("D-768：SelfCritic 补分母（记录全部评分）")
class SelfCriticFeedbackSampleTest {

    private static SelfCriticHelper helperWith(IntelligenceFeedbackRecordMapper mapper) throws Exception {
        SelfCriticHelper helper = new SelfCriticHelper();
        Field f = SelfCriticHelper.class.getDeclaredField("feedbackMapper");
        f.setAccessible(true);
        f.set(helper, mapper);
        return helper;
    }

    /** 反射调用私有的 autoSaveFeedback，返回被 insert 的那条记录 */
    private static IntelligenceFeedbackRecord save(IntelligenceFeedbackRecordMapper mapper, double score)
            throws Exception {
        SelfCriticHelper helper = helperWith(mapper);
        Method m = SelfCriticHelper.class.getDeclaredMethod("autoSaveFeedback",
                String.class, String.class, String.class, double.class, String.class, boolean.class);
        m.setAccessible(true);
        m.invoke(helper, "sess-1", "今天生产了多少件", "共 120 件", score, "综合评分报告", false);

        ArgumentCaptor<IntelligenceFeedbackRecord> captor =
                ArgumentCaptor.forClass(IntelligenceFeedbackRecord.class);
        verify(mapper).insert(captor.capture());
        return captor.getValue();
    }

    @Test
    @DisplayName("① 低分仍写 rejected —— 历史语义不得变（下游都按 rejected 过滤）")
    void lowScoreStillRejected() throws Exception {
        IntelligenceFeedbackRecord r = save(mock(IntelligenceFeedbackRecordMapper.class), 60.0);
        assertThat(r.getFeedbackResult())
                .as("低分必须仍是 rejected，否则下游 PromptContextProvider / LearningLoop 语义被改坏")
                .isEqualTo("rejected");
        assertThat(r.getDeviationMinutes()).as("偏差分 = 100 - 60").isEqualTo(40L);
        assertThat(r.getSuggestionType()).isEqualTo("agent_loop_quality");
    }

    @Test
    @DisplayName("② 高分写 observed（样本行，补分母）")
    void highScoreWritesObservedSample() throws Exception {
        IntelligenceFeedbackRecord r = save(mock(IntelligenceFeedbackRecordMapper.class), 90.0);
        assertThat(r.getFeedbackResult())
                .as("高分必须是样本标记，不能是 rejected")
                .isEqualTo(SelfCriticHelper.RESULT_OBSERVED);
        assertThat(r.getDeviationMinutes()).as("偏差分 = 100 - 90").isEqualTo(10L);
    }

    @Test
    @DisplayName("③ 任何分数都必须落库 —— 否则分母仍然缺失")
    void everyScorePersists() throws Exception {
        for (double score : new double[]{0.0, 50.0, 74.9, 75.0, 90.0, 100.0}) {
            IntelligenceFeedbackRecordMapper mapper = mock(IntelligenceFeedbackRecordMapper.class);
            save(mapper, score);
            verify(mapper).insert(any(IntelligenceFeedbackRecord.class));
        }
    }

    @Test
    @DisplayName("④ 样本取值不得与真实用户反馈的 rejected/accepted 冲突")
    void observedValueDoesNotCollide() {
        assertThat(SelfCriticHelper.RESULT_OBSERVED)
                .as("不能叫 rejected —— 会污染低分链路")
                .isNotEqualTo("rejected")
                .as("不能叫 accepted —— FeedbackLearningOrchestrator 用它统计采纳率")
                .isNotEqualTo("accepted");
    }

    @Test
    @DisplayName("⑤ 调用点必须无条件落库（防止后人把 < 75 的守卫加回去）")
    void callSiteIsUnconditional() throws Exception {
        String src = null;
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/intelligence/helper/SelfCriticHelper.java",
                "backend/src/main/java/com/fashion/supplychain/intelligence/helper/SelfCriticHelper.java")) {
            if (Files.exists(Path.of(p))) {
                src = Files.readString(Path.of(p), StandardCharsets.UTF_8);
                break;
            }
        }
        assertThat(src).as("应能找到 SelfCriticHelper.java").isNotNull();
        assertThat(src)
                .as("D-768 已移除调用点守卫；它若回来说明「补分母」被回退了")
                .doesNotContain("if (overallScore < SELF_IMPROVE_THRESHOLD)");
        assertThat(src)
                .as("仍必须调用 autoSaveFeedback")
                .contains("autoSaveFeedback(sessionId");
    }
}
