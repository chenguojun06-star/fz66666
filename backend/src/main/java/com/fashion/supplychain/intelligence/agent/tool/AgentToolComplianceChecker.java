package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class AgentToolComplianceChecker {

    private final List<AgentTool> registeredTools;

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
    }
}
