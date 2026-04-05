package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.orchestration.SampleDelayAnalysisOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 样板延期分析工具 — 通过小云AI对话分析打样/样衣延期情况。
 */
@Slf4j
@Component
public class SampleDelayAnalysisTool extends AbstractAgentTool {

    @Autowired
    private SampleDelayAnalysisOrchestrator orchestrator;

    @Override
    public String getName() {
        return "tool_sample_delay_analysis";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("keyword", stringProp("可选：按款号/纸样师筛选"));
        return buildToolDef(
                "分析样板/打样延期情况。当用户问'哪些样板延期了'、'打样进度怎么样'、"
                        + "'交板延期统计'时调用。输出延期率、按纸样师分组、待交样板列表。",
                properties, List.of());
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> result = orchestrator.analyze();
        int delayRate = (int) result.getOrDefault("delayRate", 0);
        int delayedCount = (int) result.getOrDefault("delayedCount", 0);
        int totalSamples = (int) result.getOrDefault("totalSamples", 0);
        String msg = String.format("共 %d 个样板任务，其中 %d 个延期（延期率 %d%%）", totalSamples, delayedCount, delayRate);
        return successJson(msg, result);
    }
}
