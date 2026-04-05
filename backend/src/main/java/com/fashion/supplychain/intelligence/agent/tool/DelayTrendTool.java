package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.orchestration.DelayTrendOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 延期趋势分析工具 — 通过小云AI对话查看延期趋势走向。
 */
@Slf4j
@Component
public class DelayTrendTool extends AbstractAgentTool {

    @Autowired
    private DelayTrendOrchestrator orchestrator;

    @Override
    public String getName() {
        return "tool_delay_trend";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("period", stringProp("趋势周期：week(近8周,默认)/month(近12周)"));
        return buildToolDef(
                "分析延期趋势变化。当用户问'延期趋势怎么样'、'延期率在好转吗'、"
                        + "'最近几周延期走势'时调用。输出逐周延期率曲线和趋势方向。",
                properties, List.of());
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String period = optionalString(args, "period");
        Map<String, Object> result = orchestrator.analyze(period);
        String direction = (String) result.getOrDefault("trendDirection", "波动");
        String msg = String.format("延期趋势分析完成，当前趋势：%s", direction);
        return successJson(msg, result);
    }
}
