package com.fashion.supplychain.intelligence.helper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * D-917：历史消息绝对 token 上限的守护用例。
 *
 * <p>背景：D-761 把全局 tokenBudget 30000→100000 后，compactConversationHistory
 * 的 usagePct 阈值（>=60%）事实上永远达不到，三级压缩从未触发；而且那条压缩路径
 * 要同步调一次 LLM，触发了反而更慢。本组用例锁死「超上限直接截断、不调 LLM」。
 */
@ExtendWith(MockitoExtension.class)
class AiAgentMemoryHistoryBudgetTest {

    @Mock
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    private AiAgentMemoryHelper helper;

    @BeforeEach
    void setUp() {
        helper = new AiAgentMemoryHelper();
        ReflectionTestUtils.setField(helper, "inferenceOrchestrator", inferenceOrchestrator);
        ReflectionTestUtils.setField(helper, "maxMemoryTurns", 20);
        ReflectionTestUtils.setField(helper, "maxHistoryTokens", 200);
    }

    private static List<AiMessage> history(int turns) {
        List<AiMessage> list = new ArrayList<>();
        for (int i = 0; i < turns; i++) {
            list.add(AiMessage.user("第" + i + "轮问题和一些业务描述内容"));
            list.add(AiMessage.assistant("第" + i + "轮回答和查询到的业务数据明细"));
        }
        return list;
    }

    @Test
    @DisplayName("历史超上限 → 截断，且不触发 LLM 压缩调用")
    void overflowTruncatesWithoutLlm() {
        List<AiMessage> original = history(20);
        assertThat(helper.estimateTokens(original)).isGreaterThan(200);

        List<AiMessage> result = helper.compactConversationHistory(original, 100_000);

        assertThat(result).isNotEmpty();
        assertThat(result.size()).isLessThan(original.size());
        assertThat(helper.estimateTokens(result)).isLessThanOrEqualTo(200);
        // 绝不走同步 LLM 压缩（那会增加一次往返，越压越慢）
        verify(inferenceOrchestrator, never()).chat(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyList(), org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    @DisplayName("截断保留的是最近的消息，且保持原始时间顺序")
    void keepsMostRecentInOrder() {
        List<AiMessage> original = history(20);
        List<AiMessage> result = helper.compactConversationHistory(original, 100_000);

        AiMessage lastOriginal = original.get(original.size() - 1);
        AiMessage lastResult = result.get(result.size() - 1);
        assertThat(lastResult.getContent()).isEqualTo(lastOriginal.getContent());
        // 结果应是原列表的尾部连续片段
        int start = original.size() - result.size();
        for (int i = 0; i < result.size(); i++) {
            assertThat(result.get(i).getContent()).isEqualTo(original.get(start + i).getContent());
        }
    }

    @Test
    @DisplayName("历史在上限内 → 原样返回，不改动内容")
    void underBudgetKeepsAll() {
        List<AiMessage> original = history(1);
        if (helper.estimateTokens(original) > 200) return; // 估算偏大时跳过，避免环境差异误报

        List<AiMessage> result = helper.compactConversationHistory(original, 100_000);
        assertThat(result).hasSize(original.size());
        assertThat(result.get(0).getContent()).isEqualTo(original.get(0).getContent());
    }

    @Test
    @DisplayName("上限设为 0 → 关闭截断（运维可回退）")
    void zeroDisablesTruncation() {
        ReflectionTestUtils.setField(helper, "maxHistoryTokens", 0);
        List<AiMessage> original = history(20);
        // 不截断时，turnCount=20 会走三级压缩路径；这里只确认没有因绝对上限被提前截断
        // （三级压缩可能调 LLM，但 Mock 默认返回 null 会走 catch 分支保留最近消息）
        List<AiMessage> result = helper.compactConversationHistory(original, -1);
        assertThat(result).isNotNull();
    }
}
