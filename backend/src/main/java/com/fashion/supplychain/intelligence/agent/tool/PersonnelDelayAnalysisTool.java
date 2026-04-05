package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.orchestration.PersonnelDelayAnalysisOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 人员延期分析工具 — 通过小云AI对话分析跟单员/纸样师/工厂的延期情况。
 */
@Slf4j
@Component
public class PersonnelDelayAnalysisTool extends AbstractAgentTool {

    @Autowired
    private PersonnelDelayAnalysisOrchestrator orchestrator;

    @Override
    public String getName() {
        return "tool_personnel_delay_analysis";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("groupBy", stringProp("分组维度：merchandiser(跟单员)/patternMaker(纸样师)/factory(工厂)，默认全部"));
        return buildToolDef(
                "分析人员维度的生产延期情况。当用户问'哪个跟单员延期最多'、'工厂延期率排名'、"
                        + "'纸样师延期统计'时调用。输出延期率、平均延期天数、最严重订单。",
                properties, List.of());
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> result = orchestrator.analyze();
        int delayRate = (int) result.getOrDefault("delayRate", 0);
        int delayedCount = (int) result.getOrDefault("delayedCount", 0);
        int totalOrders = (int) result.getOrDefault("totalOrders", 0);
        String msg = String.format("共 %d 个订单，其中 %d 个延期（延期率 %d%%）", totalOrders, delayedCount, delayRate);
        return successJson(msg, result);
    }
}
