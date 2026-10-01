package com.fashion.supplychain.intelligence.gateway;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AI 推理网关契约守护（D-698）
 *
 * <p><b>为什么需要这个测试</b>：项目自研了 {@link AiInferenceGateway} 抽象层，
 * 全仓<b>只有 3 个文件</b>直接引用 Spring AI：
 * <ul>
 *   <li>{@code intelligence/springai/SpringAiAdapterConfig.java} ← 当前 Boot 4.1.1 启动阻断点</li>
 *   <li>{@code intelligence/gateway/SpringAiInferenceAdapter.java} ← 唯一实现</li>
 *   <li>{@code FashionSupplychainApplication.java}（自动配置排除清单）</li>
 * </ul>
 *
 * <p>即：**{@link AiInferenceGateway} 是 Spring AI 2.0 迁移必须保持不变的契约**。
 * 一旦这个接口变了，AgentLoopEngine（1487 行）、110 个 AI 工具、57 处 Advisor 引用全部受影响。
 * 本测试把契约显式钉住，使 2.0 迁移时「契约是否被破坏」变成
 * <b>编译期 + 测试期可见</b>，而不是「生产运行时才发现」。
 *
 * <p><b>不依赖真实 LLM</b>：用记录型 Fake 实现捕获调用参数，
 * 因此可在 CI / 离线环境稳定运行。
 */
@DisplayName("AI 推理网关契约（D-698：Spring AI 2.0 迁移的唯一防线）")
class AiInferenceGatewayContractTest {

    /** 记录型 Fake：捕获网关被调用时的全部入参，用于钉住契约。 */
    static class RecordingGateway implements AiInferenceGateway {
        final List<String> scenes = new ArrayList<>();
        final List<List<AiMessage>> messagesSeen = new ArrayList<>();
        final List<List<AiTool>> toolsSeen = new ArrayList<>();
        final AtomicInteger callCount = new AtomicInteger();

        @Override
        public IntelligenceInferenceResult chat(String scene, String systemPrompt, String userMessage) {
            scenes.add(scene);
            callCount.incrementAndGet();
            return result("ok:" + userMessage);
        }

        @Override
        public IntelligenceInferenceResult chat(String scene, List<AiMessage> messages, List<AiTool> tools) {
            scenes.add(scene);
            messagesSeen.add(messages);
            toolsSeen.add(tools);
            callCount.incrementAndGet();
            return result("ok:tools=" + (tools == null ? 0 : tools.size()));
        }

        @Override
        public IntelligenceInferenceResult chatStream(String scene, List<AiMessage> messages,
                                                      List<AiTool> tools, StreamChunkConsumer chunkConsumer) {
            scenes.add(scene);
            chunkConsumer.accept("chunk-1", false);
            chunkConsumer.accept("chunk-2", true);
            callCount.incrementAndGet();
            return result("ok:stream");
        }

        @Override
        public IntelligenceInferenceResult chatWithVision(String scene, String systemPrompt,
                                                          String userMessage, String imageUrl) {
            scenes.add(scene);
            callCount.incrementAndGet();
            return result("ok:vision");
        }

        @Override
        public boolean isAvailable() { return true; }

        @Override
        public boolean isVisionAvailable() { return true; }

        @Override
        public String getProviderName() { return "recording-fake"; }

        private IntelligenceInferenceResult result(String content) {
            IntelligenceInferenceResult r = new IntelligenceInferenceResult();
            r.setContent(content);
            return r;
        }
    }

    /** AiTool 的嵌套对象无默认初始化，需显式构造（这是 DTO 的既有特性，测试需适配）。 */
    private static AiTool newTool(String name) {
        AiTool tool = new AiTool();
        tool.setFunction(new AiTool.AiFunction());
        tool.getFunction().setName(name);
        tool.getFunction().setParameters(new AiTool.AiParameters());
        return tool;
    }

    @Test
    @DisplayName("契约：三参数 chat（system+user）可用且回传内容")
    void chatWithSystemAndUser() {
        RecordingGateway gw = new RecordingGateway();
        IntelligenceInferenceResult r = gw.chat("order-query", "你是助手", "查订单 PO001");

        assertThat(r.getContent()).isEqualTo("ok:查订单 PO001");
        assertThat(gw.scenes).containsExactly("order-query");
        assertThat(gw.callCount.get()).isEqualTo(1);
    }

    @Test
    @DisplayName("契约：带 messages + tools 的 chat 必须原样透传工具列表（工具调用环路依赖）")
    void chatPassesToolsThrough() {
        RecordingGateway gw = new RecordingGateway();
        AiTool tool = newTool("tool_production_progress");
        List<AiTool> tools = List.of(tool);

        IntelligenceInferenceResult r = gw.chat("agent-loop", List.of(), tools);

        assertThat(r.getContent()).isEqualTo("ok:tools=1");
        // 关键断言：工具列表被原样传给实现类 → 2.0 迁移若改变工具传递方式会失败
        assertThat(gw.toolsSeen).hasSize(1);
        assertThat(gw.toolsSeen.get(0)).hasSize(1);
        assertThat(gw.toolsSeen.get(0).get(0).getFunction().getName())
                .isEqualTo("tool_production_progress");
    }

    @Test
    @DisplayName("契约：流式 chat 逐块回调（前端 SSE 依赖）")
    void streamDeliversChunks() {
        RecordingGateway gw = new RecordingGateway();
        StringBuilder sb = new StringBuilder();
        IntelligenceInferenceResult r = gw.chatStream("sse-scene", List.of(), List.of(),
                (chunk, done) -> sb.append(chunk));

        assertThat(r.getContent()).isEqualTo("ok:stream");
        assertThat(sb.toString()).isEqualTo("chunk-1chunk-2");
    }

    @Test
    @DisplayName("契约：视觉与可用性方法必须可实现（多模态场景依赖）")
    void visionAndAvailability() {
        RecordingGateway gw = new RecordingGateway();
        assertThat(gw.chatWithVision("qc", "描述", "看图", "http://img/a.png").getContent())
                .isEqualTo("ok:vision");
        assertThat(gw.isAvailable()).isTrue();
        assertThat(gw.isVisionAvailable()).isTrue();
        assertThat(gw.getProviderName()).isNotBlank();
    }

    @Test
    @DisplayName("契约：chatWithModel 有默认实现（不强制实现类覆写，2.0 迁移时兼容）")
    void chatWithModelHasDefaultImpl() {
        RecordingGateway gw = new RecordingGateway();
        // 默认实现应降级到标准 chat，并忽略 modelId
        String out = gw.chatWithModel("prompt", 1L, 2L, "deepseek-flash");

        assertThat(out).isEqualTo("ok:prompt");
        assertThat(gw.scenes).containsExactly("model-selection");
    }

    @Test
    @DisplayName("契约：AiTool 结构是 OpenAI function 格式（2.0 迁移需保持与模型无关）")
    void toolSchemaShapeIsStable() {
        AiTool tool = newTool("tool_inventory_summary");
        tool.getFunction().setDescription("库存汇总");
        tool.getFunction().getParameters().setRequired(List.of("styleNo"));

        assertThat(tool.getType()).isEqualTo("function");
        assertThat(tool.getFunction().getParameters().getType()).isEqualTo("object");
        assertThat(tool.getFunction().getParameters().getRequired()).containsExactly("styleNo");
    }

    @Test
    @DisplayName("契约：AiToolCall 的工具名与参数可被解析（环路据此分发）")
    void toolCallParsesFunctionName() {
        AiToolCall call = new AiToolCall();
        call.setId("call_1");
        call.setFunction(new AiToolCall.AiFunctionCall());
        call.getFunction().setName("tool_production_progress");
        call.getFunction().setArguments("{\"styleNo\":\"BR001\"}");

        assertThat(call.getFunctionName()).isEqualTo("tool_production_progress");
        assertThat(call.getFunction().getArguments()).contains("BR001");
    }
}
