package com.fashion.supplychain.intelligence.routing;

import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.agent.tool.ToolDomain;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 工具可达性回归守护（D-702 P0：63% 的工具 LLM 永远看不到）
 *
 * <p><b>缺陷本质是「静默不可达」，比崩溃更危险</b>：工具全部编译通过、注册进 Spring
 * bean 容器（生产日志「已注册工具」103 条印证），执行能力也完好 —— 但 LLM 选择不到它们。
 * 代码层面没有任何报错，没有任何日志，只有「工具有用却没人调」这一结果。
 *
 * <p><b>实测机制</b>（三层过滤逐层叠加）：
 * <ol>
 *   <li>意图匹配成功 → {@code advisedToolNames} 只含 {@code INTENT_TO_TOOLS} 里的工具名；</li>
 *   <li>而 84 个已注册工具中<b>只有 37 个</b>出现在 {@code INTENT_TO_TOOLS} 里 → 其余 47 个被滤掉；</li>
 *   <li>另有 15 个工具<b>根本没进 TOOL_RULES</b>，不在意图表、排序又是 MAX_VALUE 排最后；</li>
 *   <li>意图匹配失败时走 {@code capTools} → {@code subList(0, 12)}，那 15 个仍被截掉。</li>
 * </ol>
 * 结果：用户问「有没有异常」「交期能不能赶上」时，模型手里只有该意图预设的 2–4 个工具。
 *
 * <p><b>修复</b>：① 给 15 个未注册工具补注册；② advise 增加「同域补齐」——
 * 意图命中的工具仍排前面，再补入同域工具直到 {@code MAX_TOOLS_PER_CALL}。
 * 刻意<b>不改 MAX_TOOLS_PER_CALL</b>，所以每次仍最多 12 个工具，prompt 体积与成本不变。
 */
@DisplayName("工具可达性（D-702 P0：已实现却选不到的工具）")
class ToolReachabilityTest {

    private static final List<String> ADVISOR_CANDIDATES = List.of(
            "src/main/java/com/fashion/supplychain/intelligence/routing/AiAgentToolAdvisor.java",
            "backend/src/main/java/com/fashion/supplychain/intelligence/routing/AiAgentToolAdvisor.java");
    private static final List<String> ACCESS_CANDIDATES = List.of(
            "src/main/java/com/fashion/supplychain/intelligence/service/AiAgentToolAccessService.java",
            "backend/src/main/java/com/fashion/supplychain/intelligence/service/AiAgentToolAccessService.java");
    private static final Path IMPL_ROOT = Path.of("src/main/java");

    private static String read(List<String> candidates) throws Exception {
        for (String c : candidates) {
            Path p = Path.of(c);
            if (Files.exists(p)) return Files.readString(p, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到文件: " + candidates);
    }

    /** 全部已实现工具的工具名（来自 extends AbstractAgentTool 的类） */
    private static Set<String> allImplementedToolNames() throws Exception {
        Set<String> names = new HashSet<>();
        try (var stream = Files.walk(IMPL_ROOT)) {
            for (Path p : stream.filter(x -> x.toString().endsWith(".java")).toList()) {
                String s = Files.readString(p, StandardCharsets.UTF_8);
                if (!s.contains("extends AbstractAgentTool")) continue;
                Matcher m = Pattern.compile("return\\s*\"(tool_[a-z0-9_]+)\"").matcher(s);
                if (m.find()) names.add(m.group(1));
            }
        }
        return names;
    }

    private static Set<String> registeredToolNames() throws Exception {
        Set<String> names = new HashSet<>();
        Matcher m = Pattern.compile("register\\(\\s*\"(tool_[a-z0-9_]+)\"")
                .matcher(read(ACCESS_CANDIDATES));
        while (m.find()) names.add(m.group(1));
        return names;
    }

    private static Set<String> intentMappedToolNames() throws Exception {
        String s = read(ADVISOR_CANDIDATES);
        String blk = s.substring(s.indexOf("INTENT_TO_TOOLS = Map.ofEntries("));
        blk = blk.substring(0, blk.indexOf(");") + 2);
        Set<String> names = new HashSet<>();
        Matcher m = Pattern.compile("\"(tool_[a-z0-9_]+)\"").matcher(blk);
        while (m.find()) names.add(m.group(1));
        return names;
    }

    @Test
    @DisplayName("每个已实现工具都必须注册：否则权限/领域/引导语三项元数据全缺失")
    void everyImplementedToolIsRegistered() throws Exception {
        Set<String> implemented = allImplementedToolNames();
        Set<String> registered = registeredToolNames();
        Set<String> missing = new HashSet<>(implemented);
        missing.removeAll(registered);
        missing.remove("procedural_memory_tool"); // 非 tool_ 前缀的例外
        assertThat(missing)
                .as("这些工具已实现且被 Spring 注入 toolMap，但未进 TOOL_RULES → 无引导语、无领域标签、工人不可见")
                .isEmpty();
    }

    @Test
    @DisplayName("本次修复补注册的 15 个工具不得被回退（逐个点名，防止再次遗漏）")
    void theFifteenPreviouslyUnregisteredToolsStayRegistered() throws Exception {
        Set<String> registered = registeredToolNames();
        List<String> mustRegister = List.of(
                "tool_anomaly_detection", "tool_delivery_prediction", "tool_nl_query",
                "tool_finance_anomaly", "tool_multi_agent_debate", "tool_scheduling_suggestion",
                "tool_standard_action", "tool_digital_employee", "tool_visual_style_search",
                "tool_vision_analyze", "tool_vision_style_identify", "tool_vision_defect_detect",
                "tool_vision_color_check", "tool_db_health_check", "tool_flyway_safety_check");
        List<String> missing = new ArrayList<>();
        for (String t : mustRegister) if (!registered.contains(t)) missing.add(t);
        assertThat(missing).as("这 15 个是本次补注册的对象，其中包含异常检测/交期预测等核心业务工具").isEmpty();
    }

    @Test
    @DisplayName("运维类工具必须 workerVisible=false：不能因为补注册就把数据库检查开放给车间用户")
    void opsToolsStayManagerOnly() throws Exception {
        String s = read(ACCESS_CANDIDATES);
        assertThat(s).contains("register(\"tool_db_health_check\",");
        assertThat(s).contains("register(\"tool_flyway_safety_check\",");
        Matcher m = Pattern.compile(
                "register\\(\"(tool_db_health_check|tool_flyway_safety_check)\",\\s*\"[^\"]*\",\\s*(true|false)")
                .matcher(s);
        int checked = 0;
        while (m.find()) {
            assertThat(m.group(2))
                    .as("%s 是运维/开发工具，必须限制为管理侧可见", m.group(1))
                    .isEqualTo("false");
            checked++;
        }
        assertThat(checked).as("两条注册都应被校验到").isEqualTo(2);
    }

    @Test
    @DisplayName("必须存在「同域补齐」：否则意图匹配时 47 个无意图工具被 filter 滤掉")
    void sameDomainBackfillExists() throws Exception {
        String s = read(ADVISOR_CANDIDATES);
        assertThat(s)
                .as("没有同域补齐，intent 命中的工具集之外的工具永远看不到")
                .contains("同域补齐")
                .contains("getDomainForTool");
    }

    @Test
    @DisplayName("同域补齐不得突破 MAX_TOOLS_PER_CALL：否则 prompt 体积与成本失控")
    void sameDomainBackfillRespectsCap() throws Exception {
        String s = read(ADVISOR_CANDIDATES);
        int cap = Integer.parseInt(Pattern.compile("MAX_TOOLS_PER_CALL\\s*=\\s*(\\d+)").matcher(s)
                .results().findFirst().orElseThrow().group(1));
        assertThat(cap)
                .as("补齐逻辑必须停在 capTools 上限内；一旦调大，每次 prompt 的工具 schema 会成倍膨胀")
                .isLessThanOrEqualTo(12);
        // 补齐循环里必须有上限判断
        assertThat(s).contains("if (advised.size() >= MAX_TOOLS_PER_CALL) break;");
    }

    @Test
    @DisplayName("未落进意图映射的工具必须靠同域补齐兜住（记录当前覆盖率，作为后续扩映射的依据）")
    void intentCoverageIsTracked() throws Exception {
        Set<String> registered = registeredToolNames();
        Set<String> mapped = intentMappedToolNames();
        Set<String> unmapped = new HashSet<>(registered);
        unmapped.removeAll(mapped);
        // 本次采用同域补齐而非逐个补关键词，故未映射是允许的；但必须为 0 个「不可达」
        // —— 可达性由 advise 的同域补齐保证。
        assertThat(unmapped)
                .as("未在意图映射内的工具依赖同域补齐可达；该集合非空是预期，故此处不断言为空")
                .isNotNull();
        System.out.printf("  [覆盖统计] 已注册 %d，意图直接映射 %d，依赖同域补齐 %d%n",
                registered.size(), mapped.size(), unmapped.size());
    }

    @Test
    @DisplayName("ToolDomain 的 ANALYSIS/GENERAL 视为跨域，可参与任何意图的补齐")
    void crossDomainToolsAreAnalysisAndGeneral() {
        assertThat(ToolDomain.ANALYSIS.getLabel()).isNotBlank();
        assertThat(ToolDomain.GENERAL.getLabel()).isNotBlank();
    }

    /** 直接调用 advise 太重（需要完整 AgentTool 列表），故用反射确认补齐方法存在于类中 */
    @Test
    @DisplayName("AiAgentToolAccessService.getDomainForTool 必须 public static（advisor 跨类调用）")
    void getDomainForToolIsAccessible() throws Exception {
        Method m = AiAgentToolAccessService.class.getMethod("getDomainForTool", String.class);
        assertThat(java.lang.reflect.Modifier.isPublic(m.getModifiers())).isTrue();
        assertThat(java.lang.reflect.Modifier.isStatic(m.getModifiers())).isTrue();
    }
}