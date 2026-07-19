package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@Lazy
public class AgentToolComplianceChecker {

    private final List<AgentTool> registeredTools;

    /**
     * 【P1-8修复】fail-fast 开关：默认 false（仅记录日志），生产环境可设为 true 阻止启动。
     * <p>对应 application.yml 配置：
     * <pre>
     * intelligence:
     *   tool:
     *     compliance:
     *       fail-fast: true   # 严重违规时阻止应用启动
     * </pre>
     */
    @Value("${intelligence.tool.compliance.fail-fast:false}")
    private boolean failFast;

    public AgentToolComplianceChecker(List<AgentTool> registeredTools) {
        this.registeredTools = registeredTools;
    }

    @EventListener(ContextRefreshedEvent.class)
    public void checkCompliance() {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        for (AgentTool tool : registeredTools) {
            String className = tool.getClass().getSimpleName();
            String toolName = tool.getName();

            if (!(tool instanceof AbstractAgentTool)) {
                errors.add(className + " implements AgentTool directly instead of extending AbstractAgentTool — " +
                        "missing: tenant isolation, permission check, param validation, timeout, audit");
            }

            AgentToolDef def = tool.getClass().getAnnotation(AgentToolDef.class);
            if (def == null) {
                warnings.add(className + " missing @AgentToolDef annotation — domain routing and timeout will not work");
            } else {
                if (!def.name().equals(toolName)) {
                    errors.add(className + ": @AgentToolDef.name='" + def.name() + "' != getName()='" + toolName + "'");
                }
            }

            try {
                AiTool toolDef = tool.getToolDefinition();
                if (toolDef == null || toolDef.getFunction() == null) {
                    errors.add(className + ": getToolDefinition() returns null or missing function");
                } else {
                    if (!toolName.equals(toolDef.getFunction().getName())) {
                        errors.add(className + ": getToolDefinition().function.name='" + toolDef.getFunction().getName() +
                                "' != getName()='" + toolName + "'");
                    }
                    if (toolDef.getFunction().getParameters() == null
                            || toolDef.getFunction().getParameters().getProperties() == null
                            || toolDef.getFunction().getParameters().getProperties().isEmpty()) {
                        warnings.add(className + ": tool definition has no parameters defined");
                    }
                }
            } catch (Exception e) {
                errors.add(className + ": getToolDefinition() threw " + e.getClass().getSimpleName() + ": " + e.getMessage());
            }
        }

        if (!errors.isEmpty()) {
            log.error("[ToolCompliance] {} CRITICAL violations found:", errors.size());
            for (int i = 0; i < errors.size(); i++) {
                log.error("  [{}] {}", i + 1, errors.get(i));
            }
        }

        if (!warnings.isEmpty()) {
            log.warn("[ToolCompliance] {} warnings found:", warnings.size());
            for (int i = 0; i < warnings.size(); i++) {
                log.warn("  [{}] {}", i + 1, warnings.get(i));
            }
        }

        if (errors.isEmpty() && warnings.isEmpty()) {
            log.info("[ToolCompliance] All {} tools passed compliance check ✓", registeredTools.size());
        }

        log.info("[ToolCompliance] Registered {} tools: {}", registeredTools.size(),
                registeredTools.stream().map(AgentTool::getName).sorted().toList());

        // 【P1-8修复】fail-fast：严重违规时抛异常阻止应用启动
        // 默认 false 保持向后兼容；生产环境通过 application-prod.yml 设置 true 启用
        if (failFast && !errors.isEmpty()) {
            String msg = "[ToolCompliance] fail-fast=true，发现 " + errors.size()
                    + " 个严重违规，应用启动被阻止。违规清单：\n  - "
                    + String.join("\n  - ", errors);
            log.error(msg);
            throw new IllegalStateException(msg);
        }
    }
}
