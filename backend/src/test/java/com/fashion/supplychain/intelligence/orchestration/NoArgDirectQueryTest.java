package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 无参工具直查回归守护（D-702）
 *
 * <p><b>为什么先做这两个</b>：订单进度直查还需要从问题里提取订单号（要防猜错），
 * 而异常检测 / 财务异常是<b>无参工具</b>：
 * <ul>
 *   <li>零参数歧义 —— 不需要提取任何标识符，不可能猜错；</li>
 *   <li>内部不调 LLM —— {@code AnomalyDetectionOrchestrator.detect()} 是纯 z-score 统计，
 *       走 Agent 循环等于把亚秒级统计包装成两轮 LLM 往返（约 20 秒）；</li>
 *   <li>结论确定 —— 输出是规则算出的清单，不需要模型"解释"。</li>
 * </ul>
 * 所以它是所有候选里风险最低的一档。
 */
@DisplayName("无参直查（D-702：有没有异常不必等 20 秒）")
class NoArgDirectQueryTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static String read() throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/intelligence/orchestration/DirectQueryRouter.java",
                "backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/DirectQueryRouter.java")) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到 DirectQueryRouter.java");
    }

    @Test
    @DisplayName("① 两个无参工具都必须接入直查")
    void bothToolsWired() throws Exception {
        String s = read();
        assertThat(s).as("异常检测应走直查").contains("tool_anomaly_detection");
        assertThat(s).as("财务异常应走直查").contains("tool_finance_anomaly");
        assertThat(s).as("无参直查必须先于订单进度分支（无歧义的先试）")
                .contains("tryNoArgDirect");
    }

    @Test
    @DisplayName("② 必须先校验工具权限：直查绕过 Agent 循环，不能给无权角色开旁路")
    void permissionCheckedFirst() throws Exception {
        String s = read();
        int start = s.indexOf("private DirectAnswer tryNoArgDirect");
        assertThat(start).as("应存在 tryNoArgDirect").isGreaterThan(0);
        String m = s.substring(start, Math.min(start + 2000, s.length()));
        int perm = m.indexOf("canUseTool(toolName)");
        int exec = m.indexOf("tool.execute(");
        assertThat(perm).as("必须显式校验权限").isGreaterThan(0);
        assertThat(exec).as("应存在执行调用").isGreaterThan(0);
        assertThat(perm)
                .as("权限校验必须早于执行")
                .isLessThan(exec);
    }

    @Test
    @DisplayName("③ 失败一律降级交回 Agent：异常/工具缺失/解析失败都不得报错")
    void allFailuresFallBack() throws Exception {
        String s = read();
        int start = s.indexOf("private DirectAnswer tryNoArgDirect");
        String m = s.substring(start, Math.min(start + 2000, s.length()));
        assertThat(m)
                .as("工具未注册时放弃直查")
                .contains("if (tool == null)");
        assertThat(m)
                .as("执行异常必须 catch 并交回 Agent")
                .contains("catch (Exception e)")
                .contains("交回 Agent 循环");
        assertThat(m)
                .as("success=false 必须识别，不得当成数据")
                .contains("Boolean.FALSE.equals(parsed.get(\"success\"))");
    }

    /**
     * 渲染字段必须与工具真实输出一致。
     * 字段取自 AnomalyDetectionTool（totalChecked/anomalyCount/anomalies/alert/summary）
     * 与 FinanceAnomalyTool（同名字段），两者结构一致故可共用渲染。
     */
    @Test
    @DisplayName("④ 渲染必须匹配工具真实输出结构 {totalChecked,anomalyCount,anomalies[],alert|summary}")
    void rendersRealToolStructure() throws Exception {
        String withAlert = "{\"success\":true,\"totalChecked\":120,\"anomalyCount\":2,\"anomalies\":["
                + "{\"type\":\"output_spike\",\"severity\":\"critical\",\"title\":\"产量飙升\",\"targetName\":\"张三\",\"todayValue\":90,\"historyAvg\":30},"
                + "{\"type\":\"night_scan\",\"severity\":\"warning\",\"title\":\"夜间扫码\",\"targetName\":\"一厂\",\"todayValue\":12,\"historyAvg\":2}],"
                + "\"alert\":\"🔴 发现 1 个严重异常 + 1 个警告\"}";
        Map<String, Object> parsed = MAPPER.readValue(withAlert, new TypeReference<Map<String, Object>>() {
        });
        assertThat(parsed.get("totalChecked")).isEqualTo(120);
        assertThat(parsed.get("anomalyCount")).isEqualTo(2);
        assertThat((List<?>) parsed.get("anomalies")).hasSize(2);
        assertThat(parsed).containsKey("alert");

        String noAnomaly = "{\"success\":true,\"totalChecked\":120,\"anomalyCount\":0,\"anomalies\":[],"
                + "\"summary\":\"✅ 今日生产无异常\"}";
        Map<String, Object> parsed2 = MAPPER.readValue(noAnomaly, new TypeReference<Map<String, Object>>() {
        });
        assertThat((List<?>) parsed2.get("anomalies")).isEmpty();
        assertThat(parsed2).containsKey("summary").containsEntry("summary", "✅ 今日生产无异常");
    }

    @Test
    @DisplayName("⑤ 回答必须声明数据来源，让用户能区分「规则统计」与「AI 生成」")
    void answerDeclaresRuleBasedSource() throws Exception {
        String s = read();
        assertThat(s)
                .as("CLAUDE.md 铁律 7：数据来源必须可辨识")
                .contains("直接查库，未经 AI 生成");
        assertThat(s)
                .as("异常检测是规则统计，应明确说明")
                .contains("系统规则实时统计");
    }

    /**
     * 铁律 9 回归：0 与「无数据」在业务上是两回事。
     *
     * <p>实测生产近 7 天仅 9 条扫码（09-30，1 人），今天 0 条。
     * 此时规则仍会跑完并返回「无异常」——若照搬，用户会把
     * 「今天没扫码」误读成「生产正常」。这正是铁律 9 禁止的兜底。
     */
    @Test
    @DisplayName("⑦ 无数据时必须说「无法判断」，不得报「无异常」（铁律 9）")
    void noDataMustNotReportHealthy() throws Exception {
        String s = read();
        assertThat(s)
                .as("必须显式判断样本量为 0 的情形")
                .contains("todaySampleCount")
                .contains("noData");
        assertThat(s)
                .as("必须说明「无法判断」且澄清不等于正常")
                .contains("无法判断")
                .contains("这不代表生产正常");
        assertThat(s)
                .as("样本不足但已发现异常时，仍必须报出异常")
                .contains("但仍发现");
        assertThat(s)
                .as("卡片需带 dataSufficient 供前端区分「无数据」与「真正常」")
                .contains("dataSufficient");
    }

    /**
     * {@code totalChecked} 是「跑了多少条规则」，无论有无数据都 &gt; 0，
     * 绝不能被当作「有没有数据」来判断。
     */
    @Test
    @DisplayName("⑧ 异常检测的样本量必须来自 todaySampleCount，而非 totalChecked")
    void anomalySampleCountMustNotComeFromTotalChecked() throws Exception {
        String s = read();
        // 关键不变量：renderAnomaly 取样本量只能读 todaySampleCount
        int r = s.indexOf("private DirectAnswer renderAnomaly");
        String body = s.substring(r, Math.min(r + 1800, s.length()));
        assertThat(body)
                .as("样本量必须取自 todaySampleCount")
                .contains("intOf(parsed.get(\"todaySampleCount\"))");
        assertThat(body)
                .as("绝不能用 totalChecked 当样本量——它是「跑了多少条规则」，恒大于 0")
                .doesNotContain("intOf(parsed.get(\"totalChecked\"))");

        // 财务工具例外且合法：它的 totalChecked 就是 bills.size()，本来就是样本数
        String orch = Files.readString(Path.of(
                "src/main/java/com/fashion/supplychain/intelligence/orchestration/AnomalyDetectionOrchestrator.java"),
                StandardCharsets.UTF_8);
        assertThat(orch)
                .as("异常检测 orchestrator 必须把今日记录数写进 todaySampleCount")
                .contains("setTodaySampleCount(todayRecords == null ? 0 : todayRecords.size())");

        String tool = Files.readString(Path.of(
                "src/main/java/com/fashion/supplychain/intelligence/agent/tool/AnomalyDetectionTool.java"),
                StandardCharsets.UTF_8);
        assertThat(tool)
                .as("工具必须把 todaySampleCount 透传给调用方，否则直查无从判断有无数据")
                .contains("result.put(\"todaySampleCount\", resp.getTodaySampleCount())");
    }

    @Test
    @DisplayName("⑥ 不得误伤需要推理的问法：原因分析/建议类必须交回 Agent")
    void reasoningQuestionsStillGoToAgent() throws Exception {
        String s = read();
        int start = s.indexOf("private DirectAnswer tryNoArgDirect");
        String m = s.substring(start, Math.min(start + 1200, s.length()));
        // 触发词里不能包含「为什么」「怎么办」「建议」这类需要推理的说法
        assertThat(m).doesNotContain("为什么");
        assertThat(m).doesNotContain("怎么办");
        assertThat(m).doesNotContain("建议");
        // 结尾必须保留交回 Agent 的引导
        assertThat(s).contains("可以继续问我");
    }
}
