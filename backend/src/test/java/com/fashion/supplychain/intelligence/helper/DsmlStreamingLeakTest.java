package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * DSML 协议泄漏回归守护（D-699）
 *
 * <p><b>线上事故现象</b>：AI 顾问气泡里直接显示协议残渣
 * <pre>
 * &lt; calls&gt;
 * &lt; invoke name=""&gt;(内部数据) "&gt;
 * &lt;/invoke&gt;
 * &lt;/calls&gt;
 * </pre>
 *
 * <p><b>根因</b>：旧实现（D-361c）在流式路径上<b>逐个 delta</b> 判断并清洗：
 * <pre>{@code
 * if (content.contains("DSML")) {
 *     content = content.replaceAll("[｜|]{1,4}\\s*DSML[｜|]{1,4}[^\\n]*", "");
 * }
 * chunkConsumer.accept(content);
 * }</pre>
 * 而 deepseek-flash 会把一段 DSML 协议<b>拆到多个 SSE delta</b>：
 * <pre>
 * delta1 = "<｜｜DSML｜｜ "        ← 含 "DSML"，整段被正则吃掉（侥幸正确）
 * delta2 = "invoke name=\"tool_x\">\n"  ← 不含 "DSML"，逃过清洗，原样推给前端 ← 泄漏点
 * </pre>
 * 逐 delta 判断在协议被拆行时<b>结构性失效</b>：判断"这行是不是协议"所需的信息
 * （开标记）恰好在上一片里。
 *
 * <p><b>修复</b>：跨 delta 缓冲，攒够一个完整换行才成行、成行后整行判断，
 * 使「含 DSML 标记的行」永远不会被拆开判断。
 *
 * <p><b>不依赖真实 LLM</b>：直接喂构造的 SSE 行，验证最终推给前端的分片里
 * 不含任何协议标记，且正常回答一字不丢。
 */
@DisplayName("DSML 流式泄漏回归（D-699：协议残渣泄漏到 AI 气泡）")
class DsmlStreamingLeakTest {

    private static final String MARK = "｜｜DSML｜｜"; // 全角竖线，deepseek-flash 实际输出

    // ─────────────────────────── stripLines 基础语义 ───────────────────────────

    @Test
    @DisplayName("含标记的行整行剔除，其余字符逐字保留（含换行、不被 trim）")
    void stripLines_removesOnlyMarkupLines_andPreservesRestVerbatim() {
        String text = "第一行正常回答\n"
                + "<" + MARK + " calls>\n"
                + "<" + MARK + " invoke name=\"tool_x\">\n"
                + "<" + MARK + " parameter name=\"p\" string=\"true\">(内部数据)\n"
                + "</" + MARK + " invoke>\n"
                + "</" + MARK + " calls>\n"
                + "第二行正常回答\n";

        String out = DsmlToolCallParser.stripLines(text);

        assertThat(out)
                .as("协议行必须全部消失")
                .doesNotContain("DSML")
                .doesNotContain("invoke")
                .doesNotContain("calls")
                .doesNotContain("内部数据")
                .as("两行正常回答都要保留")
                .contains("第一行正常回答")
                .contains("第二行正常回答")
                .as("行尾换行必须原样保留，不能被 trim 吞掉")
                .isEqualTo("第一行正常回答\n第二行正常回答\n");
    }

    @Test
    @DisplayName("无标记文本原样返回（零拷贝语义，不做任何改写）")
    void stripLines_withoutMarkup_returnsInputUnchanged() {
        String text = "本月月报如下：\n1. 产量 12000\n2. 良率 98.2%\n";
        assertThat(DsmlToolCallParser.stripLines(text)).isEqualTo(text);
    }

    @Test
    @DisplayName("最后一句不带换行时，仍能剔除同行内的协议标记")
    void stripLines_removesMarkupEvenWithoutTrailingNewline() {
        String text = "好的" + "<" + MARK + " calls>残留";
        assertThat(DsmlToolCallParser.stripLines(text)).isEqualTo("好的");
    }

    // ─────────────────── 核心回归：协议被拆到不同 delta ───────────────────

    @Test
    @DisplayName("【核心回归】协议被拆到多个 delta 时，前端不得收到任何协议残渣")
    void streaming_protocolSplitAcrossDeltas_neverLeaksToFrontend() throws Exception {
        // 逐字复刻线上事故：标记与 invoke/parameter 续行分属不同 delta
        List<String> deltas = List.of(
                "晚上好",                                  // 正常回答前半
                "\n我是小云",
                "\n<" + MARK + " ",                       // 标记单独一片（旧实现在此侥幸清掉）
                "calls>\n",                               // 续行：不含 DSML → 旧实现从这里开始泄漏
                "<" + MARK + " invoke name=\"tool_monthly_report\">\n",
                "<" + MARK + " parameter name=\"month\" string=\"true\">本月\n",
                "</" + MARK + " invoke>\n",
                "</" + MARK + " calls>\n",
                "本月月报已生成，请查收。");                // 协议之后的正常回答（且无结尾换行）

        List<String> pushedToFrontend = runStreamAndCollect(deltas);

        String all = String.join("", pushedToFrontend);

        assertThat(all)
                .as("协议标记/标签绝不能出现在前端气泡里")
                .doesNotContain("DSML")
                .doesNotContain("<calls>")
                .doesNotContain("invoke")
                .doesNotContain("</")
                .doesNotContain("内部数据");

        assertThat(all)
                .as("协议前后的正常回答都要完整送达")
                .isEqualTo("晚上好\n我是小云\n本月月报已生成，请查收。");
    }

    @Test
    @DisplayName("全篇无协议时，分片内容与原输入完全一致（不吞字、不改字）")
    void streaming_withoutProtocol_emitsInputUnchanged() throws Exception {
        List<String> deltas = List.of("产量", "12000", "件\n良率", " 98.2%");

        String all = String.join("", runStreamAndCollect(deltas));

        assertThat(all).isEqualTo("产量12000件\n良率 98.2%");
    }

    @Test
    @DisplayName("单个 delta 就是一个完整协议行时，同样被清干净")
    void streaming_singleDeltaWholeProtocolLine_isRemoved() throws Exception {
        List<String> deltas = List.of(
                "开始查询\n",
                "<" + MARK + " calls><" + MARK + " invoke name=\"tool_x\"></" + MARK + " invoke></" + MARK + " calls>\n",
                "查询完成。");

        String all = String.join("", runStreamAndCollect(deltas));

        assertThat(all).doesNotContain("DSML").isEqualTo("开始查询\n查询完成。");
    }

    // ─────────────────────────── 驱动私有流式解析 ───────────────────────────

    /**
     * 反射驱动 {@code IntelligenceInferenceOrchestrator.parseStreamLines}（private），
     * 返回「实际推给前端的分片列表」。
     *
     * <p>为什么用反射：该方法是 private 且只在 HTTP 流式路径里被调用，
     * 而它恰恰是本次回归的故障点。走完整 HTTP mock 成本高且脆弱；
     * 这里只锁定「分片如何切、清洗后推给前端什么」这一条纯逻辑。
     */
    @SuppressWarnings("unchecked")
    private static List<String> runStreamAndCollect(List<String> contents) throws Exception {
        IntelligenceInferenceOrchestrator orchestrator = new IntelligenceInferenceOrchestrator();

        Class<?> accClass = Class.forName(
                "com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator$StreamAccumulator");
        Constructor<?> accCtor = accClass.getDeclaredConstructor();
        accCtor.setAccessible(true);
        Object acc = accCtor.newInstance();

        // chunkConsumer 签名：(String content, boolean last) -> void
        List<String> collected = new ArrayList<>();
        Class<?> consumerType = Class.forName(
                "com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator$StreamChunkConsumer");

        Object consumer = java.lang.reflect.Proxy.newProxyInstance(
                DsmlStreamingLeakTest.class.getClassLoader(), new Class<?>[]{consumerType},
                (proxy, method, methodArgs) -> {
                    if ("accept".equals(method.getName()) && methodArgs != null && methodArgs.length > 0) {
                        String c = (String) methodArgs[0];
                        if (c != null && !c.isEmpty()) collected.add(c);
                    }
                    return null;
                });

        Method parse = IntelligenceInferenceOrchestrator.class
                .getDeclaredMethod("parseStreamLines", Stream.class, accClass, consumerType);
        parse.setAccessible(true);

        // 包装成 SSE 行：data: {json}
        List<String> sseLines = new ArrayList<>();
        for (String c : contents) {
            String json = "{\"choices\":[{\"delta\":{\"content\":"
                    + quote(c) + "},\"finish_reason\":null}]}";
            sseLines.add("data: " + json);
        }
        parse.invoke(orchestrator, sseLines.stream(), acc, consumer);

        // 与生产代码同序：解析完必须 flush 尾部半行，否则最后一句会丢
        Method flush = IntelligenceInferenceOrchestrator.class
                .getDeclaredMethod("flushDsmlTail", accClass, consumerType);
        flush.setAccessible(true);
        flush.invoke(orchestrator, acc, consumer);

        return collected;
    }

    /** 极简 JSON 字符串转义（避免测试里引依赖 ObjectMapper 的行为差异） */
    private static String quote(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        return sb.append('"').toString();
    }
}
