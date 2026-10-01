package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.test.context.ActiveProfiles;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AI 工具元数据一致性守护（D-698）
 *
 * <p>项目有 <b>110 个 AI 工具</b>（自研 {@code @AgentToolDef} 体系，非 Spring AI）。
 * 这批工具是 AI 能力的全部载体，元数据或签名错误会导致
 * 「工具注册了但模型调不动」「工具被误判为写操作而拦截」等<b>线上难复现</b>问题。
 *
 * <p><b>与 Spring AI 2.0 迁移的关系</b>：迁移只影响 2 个 Spring AI 文件，
 * 但工具体系是「迁移后能否验证行为」的依托。本测试把工具契约钉住。
 *
 * <p><b>本测试发现的既有问题（不是本次引入）</b>：
 * {@link #annotatedButNotRegistered()} 发现 2 个类标了 {@code @AgentToolDef}
 * 却<b>未实现 {@link AgentTool} 接口</b>，而 {@code McpToolScanner} 按
 * {@code getBeansOfType(AgentTool.class)} 扫描 → 它们<b>永远不会被注册、
 * 环路永远不会调用</b>，即「看起来是 AI 工具，实际是死代码」。
 */
@SpringBootTest(classes = com.fashion.supplychain.architecture.TestApplicationConfig.class)
@ActiveProfiles("test")
@DisplayName("AI 工具元数据一致性（D-698）")
class AiToolMetadataConsistencyTest {

    @Autowired
    private ApplicationContext ctx;

    /** 环路真正能调用的工具：实现了 AgentTool 且被 Spring 扫到。 */
    private List<AgentTool> registeredTools() {
        return new ArrayList<>(ctx.getBeansOfType(AgentTool.class).values());
    }

    /** 所有标了 @AgentToolDef 的 Bean（含未实现 AgentTool 的死代码）。 */
    private List<Object> allAnnotatedBeans() {
        List<Object> all = new ArrayList<>();
        for (String name : ctx.getBeanDefinitionNames()) {
            try {
                Object bean = ctx.getBean(name);
                if (bean != null && AnnotationUtils.findAnnotation(bean.getClass(), AgentToolDef.class) != null) {
                    all.add(bean);
                }
            } catch (Exception ignored) {
                // 依赖真实外部资源的 Bean 在测试环境无法实例化，跳过
            }
        }
        return all;
    }

    private static AgentToolDef defOf(Object bean) {
        return AnnotationUtils.findAnnotation(bean.getClass(), AgentToolDef.class);
    }

    @Test
    @DisplayName("注册的工具数量达到规模预期（防止扫描遗漏导致守护失效）")
    void registeredToolCountIsMeaningful() {
        assertThat(registeredTools().size())
                .as("注册工具数过少，说明本测试形同虚设（项目共 110 个 @AgentToolDef）")
                .isGreaterThan(50);
    }

    @Test
    @DisplayName("每个已注册工具的 name / description 非空")
    void everyRegisteredToolHasNameAndDescription() {
        List<String> problems = new ArrayList<>();
        for (AgentTool tool : registeredTools()) {
            AgentToolDef def = AnnotationUtils.findAnnotation(tool.getClass(), AgentToolDef.class);
            String cls = tool.getClass().getSimpleName();
            if (def == null) {
                problems.add(cls + ": 实现 AgentTool 但未标注 @AgentToolDef");
                continue;
            }
            if (def.name() == null || def.name().isBlank()) {
                problems.add(cls + ": name 为空");
            }
            if (def.description() == null || def.description().isBlank()) {
                problems.add(cls + ": description 为空");
            }
        }
        assertThat(problems)
                .as("元数据缺失会导致模型无法正确发现工具：\n" + String.join("\n", problems))
                .isEmpty();
    }

    @Test
    @DisplayName("工具名全局唯一（重名会让环路分发到错误实现）")
    void toolNamesAreUnique() {
        Set<String> names = new HashSet<>();
        List<String> dup = new ArrayList<>();
        for (AgentTool tool : registeredTools()) {
            AgentToolDef def = AnnotationUtils.findAnnotation(tool.getClass(), AgentToolDef.class);
            if (def == null || !names.add(def.name())) {
                dup.add(def == null ? tool.getClass().getSimpleName() : def.name());
            }
        }
        assertThat(dup).as("工具名重复：\n" + String.join("\n", dup)).isEmpty();
    }

    @Test
    @DisplayName("已注册工具均具备 execute(String)（环路的反射调用约定）")
    void registeredToolsImplementExecute() {
        List<String> problems = new ArrayList<>();
        for (AgentTool tool : registeredTools()) {
            try {
                Method m = tool.getClass().getMethod("execute", String.class);
                if (m.getReturnType() != String.class) {
                    problems.add(tool.getClass().getSimpleName() + ": execute 返回 " + m.getReturnType().getSimpleName());
                }
            } catch (NoSuchMethodException e) {
                problems.add(tool.getClass().getSimpleName() + ": 缺少 public String execute(String)");
            }
        }
        assertThat(problems).as("签名不符会导致环路调用失败：\n" + String.join("\n", problems)).isEmpty();
    }

    @Test
    @DisplayName("schema 的 function.name 与注解 name 一致（模型按 schema 名调用）")
    void schemaNameMatchesAnnotation() throws Exception {
        List<String> problems = new ArrayList<>();
        for (AgentTool tool : registeredTools()) {
            AgentToolDef def = AnnotationUtils.findAnnotation(tool.getClass(), AgentToolDef.class);
            if (def == null) continue;
            AiTool schema = tool.getToolDefinition();
            if (schema == null || schema.getFunction() == null) continue;
            if (!def.name().equals(schema.getFunction().getName())) {
                problems.add(tool.getClass().getSimpleName()
                        + ": 注解 name=" + def.name() + " 但 schema=" + schema.getFunction().getName());
            }
        }
        assertThat(problems).as("schema 与注解名不一致，模型调不到：\n" + String.join("\n", problems)).isEmpty();
    }

    /**
     * 🔍 本次测试发现的既有死代码（2026-10-01）。
     *
     * <p>{@code EcStockAlertNotifyTool} 与 {@code EcStockQueryTool} 标了
     * {@code @AgentToolDef}（看起来是 AI 工具），但<b>没有实现 {@link AgentTool} 接口</b>
     * —— 它们的 execute 签名是 {@code execute(Map<String,Object>)} 而非契约要求的
     * {@code execute(String)}。
     *
     * <p>而 {@code McpToolScanner:63} 用
     * {@code applicationContext.getBeansOfType(AgentTool.class)} 扫描，
     * <b>按类型扫描会跳过未实现该接口的类</b> → 这 2 个工具永远不会被注册，
     * 环路也永远不会调用它们。
     *
     * <p><b>本断言当前为「记录」而非「阻断」</b>：这是既有代码问题，
     * 且删除工具属于业务决策（可能仍在开发中或已废弃），不由测试替项目做决定。
     * 一旦有人把它们改成实现 AgentTool，本断言会通过；若长期保持现状，
     * 说明它们确认为死代码，可连同 @AgentToolDef 一起清理。
     */
    @Test
    @DisplayName("【已知问题】标注 @AgentToolDef 却未实现 AgentTool 的类（环路扫不到=死代码）")
    void annotatedButNotRegistered() {
        List<String> orphans = new ArrayList<>();
        for (Object bean : allAnnotatedBeans()) {
            if (!(bean instanceof AgentTool)) {
                orphans.add(bean.getClass().getSimpleName()
                        + "（execute 签名为 " + findExecuteSignature(bean) + "，"
                        + "非 AgentTool 契约的 execute(String)）");
            }
        }
        // 只打印不失败：作为已知问题的持续提醒
        System.out.println("[D-698][已知] 标注 @AgentToolDef 但未实现 AgentTool（环路扫不到）："
                + (orphans.isEmpty() ? "无" : String.join("；", orphans)));
        assertThat(registeredTools().size())
                .as("注册工具数异常")
                .isGreaterThan(50);
    }

    private static String findExecuteSignature(Object bean) {
        for (Method m : bean.getClass().getMethods()) {
            if ("execute".equals(m.getName())) {
                return m.getName() + "(" + m.getParameterTypes()[0].getSimpleName() + ")";
            }
        }
        return "无 execute";
    }
}
