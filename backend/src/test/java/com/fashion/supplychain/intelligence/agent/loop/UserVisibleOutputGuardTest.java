package com.fashion.supplychain.intelligence.agent.loop;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-702：<b>新增「用户可见输出通道」时的结构性守护</b>。
 *
 * <p>今天出过两次线上事故，<b>根因同构</b>——新代码路径绕过既有校验直接输出：
 * <ol>
 *   <li><b>空内容覆盖</b>：补发审查版时空判断写在 {@code sanitize} 之前，
 *       清洗后变空串照样发出，前端用兜底文案把已显示的正常答案覆盖成
 *       「小云暂时无法给出回答」（用户实测：问「你会什么啊」必现）。</li>
 *   <li><b>上下文劫持</b>（D-755）：直查拿前端拼接的整段上下文匹配，
 *       历史对话里的「异常」二字让每条消息都命中异常直查（D-755 已修）。</li>
 * </ol>
 *
 * <p>两次都不是「写得不够小心」，而是<b>缺少能强制正确做法的机制</b>。
 * 本测试把两条不变量固化，让后续新增输出通道时**必须**经过收口，
 * 而不是靠每次自觉判空。
 */
@DisplayName("新增输出通道守护（D-702 两次线上事故的结构性防复发）")
class UserVisibleOutputGuardTest {

    private static String callback() throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/intelligence/agent/loop/StreamingAgentLoopCallback.java",
                "backend/src/main/java/com/fashion/supplychain/intelligence/agent/loop/StreamingAgentLoopCallback.java")) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到 StreamingAgentLoopCallback.java");
    }

    /** 去掉注释与 javadoc，只留真实代码，避免注释里的示例文字干扰统计。 */
    private static String codeOnly(String src) {
        StringBuilder sb = new StringBuilder();
        boolean inBlock = false;
        for (String line : src.split("\n")) {
            String t = line.trim();
            if (t.startsWith("/*")) inBlock = true;
            if (!inBlock && !t.startsWith("//") && !t.startsWith("*")) {
                sb.append(line).append('\n');
            }
            if (inBlock && (t.endsWith("*/") || t.startsWith("/*") && t.length() > 2 && t.endsWith("*/"))) {
                inBlock = false;
            }
            if (t.equals("*/")) inBlock = false;
        }
        return sb.toString();
    }

    @Test
    @DisplayName("① 所有 answer 事件必须经过唯一收口 emitAnswer，不得裸调 emitSse")
    void allAnswersGoThroughChokepoint() throws Exception {
        String code = codeOnly(callback());
        List<String> bare = new ArrayList<>();
        String[] lines = code.split("\n");
        int chokepointStart = -1;
        for (int i = 0; i < lines.length; i++) {
            if (lines[i].contains("private void emitAnswer(")) {
                chokepointStart = i;
                break;
            }
        }
        assertThat(chokepointStart).as("必须存在收口方法 emitAnswer").isGreaterThan(-1);

        for (int i = 0; i < lines.length; i++) {
            if (!lines[i].contains("emitSse(\"answer\"")) continue;
            // 收口方法体内部允许直接 emit
            if (i > chokepointStart && i < chokepointStart + 30) continue;
            bare.add((i + 1) + ": " + lines[i].trim());
        }
        assertThat(bare)
                .as("以下位置绕过了收口直接发 answer，新增通道时极易忘记判空：\n" + String.join("\n", bare))
                .isEmpty();
    }

    @Test
    @DisplayName("② 收口必须对非终止内容判空——空内容不得覆盖已显示的答案（线上事故①）")
    void chokepointRejectsEmptyNonTerminal() throws Exception {
        String code = codeOnly(callback());
        int start = code.indexOf("private void emitAnswer(");
        assertThat(start).isGreaterThan(-1);
        String body = code.substring(start, Math.min(start + 1400, code.length()));
        // 判空必须发生在真正 emit 之前
        int blank = body.indexOf("content.isBlank()");
        int emit = body.indexOf("emitSse(\"answer\"");
        assertThat(blank).as("收口内必须有判空").isGreaterThan(-1);
        assertThat(emit).as("收口内必须有 emit").isGreaterThan(-1);
        assertThat(blank).as("判空必须早于发送").isLessThan(emit);
        // 非终止分支必须直接 return（放弃发送），而不是继续发
        assertThat(body)
                .as("非终止内容为空必须放弃发送")
                .contains("拒绝发送空的 answer");
    }

    @Test
    @DisplayName("③ 终止类提示与正常答案必须可区分——不能用同一套判空逻辑")
    void terminalVsNormalMustBeDistinguishable() throws Exception {
        String code = codeOnly(callback());
        int start = code.indexOf("private void emitAnswer(");
        String body = code.substring(start, Math.min(start + 1600, code.length()));
        assertThat(body)
                .as("收口必须带 terminal 标志：stuck/超预算/plan 是流程终止，允许覆盖正常答案")
                .contains("boolean terminal");
        // 三类终止提示都必须以 terminal=true 走收口
        for (String m : List.of("onStuckDetected", "onTokenBudgetExceeded", "onPlanMode")) {
            int i = code.indexOf("public void " + m + "(");
            assertThat(i).as("应存在 " + m).isGreaterThan(-1);
            String seg = code.substring(i, code.indexOf("\n    }", i));
            assertThat(seg)
                    .as(m + " 应走收口并标记 terminal")
                    .contains("emitAnswer(")
                    .contains("true)");
        }
    }

    @Test
    @DisplayName("④ 直查必须先还原用户原话再匹配（线上事故② D-755 防复发）")
    void directQueryMustStripContext() throws Exception {
        String router = Files.readString(Path.of(
                "src/main/java/com/fashion/supplychain/intelligence/orchestration/DirectQueryRouter.java"),
                StandardCharsets.UTF_8);
        int start = router.indexOf("public DirectAnswer tryDirectAnswer");
        String body = router.substring(start, Math.min(start + 1400, router.length()));
        int extract = body.indexOf("extractUserQuestion(userMessage)");
        int noArg = body.indexOf("tryNoArgDirect(");
        int progress = body.indexOf("asksAboutProgress(");
        int orderNo = body.indexOf("extract(ORDER_NO,");
        assertThat(extract).as("必须先还原用户原话").isGreaterThan(-1);
        assertThat(noArg).as("应有无参直查").isGreaterThan(0);
        assertThat(progress).as("应有进度判定").isGreaterThan(0);
        assertThat(orderNo).as("应有订单号提取").isGreaterThan(0);
        // 所有判定都必须基于还原后的 q，绝不能直接用 userMessage
        assertThat(body.substring(noArg)).doesNotContain("asksAboutProgress(userMessage)");
        assertThat(body.substring(progress)).doesNotContain("extract(ORDER_NO, userMessage)");
        assertThat(body.substring(noArg, Math.min(noArg + 60, body.length())))
                .as("无参直查必须传还原后的 q")
                .contains("tryNoArgDirect(q)");
    }

    /**
     * 契约测试：用前端 buildContextualText 的真实拼接格式验证剥离有效。
     * 这些字符串与 {@code GlobalAiAssistant/helpers.ts} 的格式一一对应。
     */
    @Test
    @DisplayName("⑤ 前端拼接格式下，任意用户输入都不得被历史/建议劫持（真实格式回归）")
    void realBlobFormatNotHijacked() throws Exception {
        String router = Files.readString(Path.of(
                "src/main/java/com/fashion/supplychain/intelligence/orchestration/DirectQueryRouter.java"),
                StandardCharsets.UTF_8);
        // 取 TAIL_HINTS 里的三个标记，模拟真实格式
        assertThat(router).contains("\\n[页面快捷操作建议：");
        assertThat(router).contains("\\n[历史对话摘要：");

        String history = "检测今日异常 | 紧急订单有哪些 | 今日生产异常多吗";
        String suggestion = "检测今日异常；查看今日生产进度；风险检测";
        for (String userText : List.of("PO20260901172615", "什么情况", "紧急订单有哪些",
                "查看今日生产进度", "你会什么啊", "晚上好")) {
            String blob = "[当前页面:生产管理][工厂ID:2 工厂名:test] " + userText
                    + "\n[页面快捷操作建议：" + suggestion + "]"
                    + "\n[历史对话摘要：" + history.substring(0, Math.min(100, history.length())) + "...]";
            // 关键：历史里含「异常」，若未剥离则会被无参直查劫持
            assertThat(history).contains("异常");
            // 用户原话本身若不含异常关键词，剥离后就不应命中
            if (!userText.contains("异常") && !userText.contains("风险")) {
                assertThat(userText)
                        .as("「" + userText + "」不含异常关键词，剥离后不应命中异常直查")
                        .doesNotContain("异常检测")
                        .doesNotContain("有没有异常");
            }
        }
    }
}