package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.AnomalyDetectionResponse;
import com.fashion.supplychain.intelligence.dto.AnomalyDetectionResponse.AnomalyItem;
import com.fashion.supplychain.intelligence.orchestration.AnomalyDetectionOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.*;

@Slf4j
@Component
@Lazy
public class AnomalyDetectionTool extends AbstractAgentTool {

    @Autowired
    private AnomalyDetectionOrchestrator anomalyDetectionOrchestrator;

    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_anomaly_detection";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();

        AiTool tool = new AiTool();
        AiTool.AiFunction fn = new AiTool.AiFunction();
        fn.setName(getName());
        fn.setDescription("异常检测工具：基于z-score统计检测4维度异常（产量飙升/质量异常/工人闲置/夜间扫码），自动识别生产中的风险信号。"
                + "当用户问\"有没有异常\"\"今天有什么问题\"\"生产异常\"\"风险检测\"时调用此工具。无需任何参数。");
        AiTool.AiParameters params = new AiTool.AiParameters();
        params.setProperties(props);
        fn.setParameters(params);
        tool.setFunction(fn);
        return tool;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        try {
            log.info("[AnomalyDetectionTool] 执行异常检测");

            AnomalyDetectionResponse resp = anomalyDetectionOrchestrator.detect();

            List<Map<String, Object>> anomalyList = new ArrayList<>();
            if (resp.getAnomalies() != null) {
                for (AnomalyItem a : resp.getAnomalies()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("type", a.getType());
                    m.put("severity", a.getSeverity());
                    m.put("title", a.getTitle());
                    m.put("description", a.getDescription());
                    m.put("targetName", a.getTargetName());
                    if (a.getTodayValue() > 0) m.put("todayValue", a.getTodayValue());
                    if (a.getHistoryAvg() > 0) m.put("historyAvg", a.getHistoryAvg());
                    if (a.getDeviationRatio() > 0) m.put("deviationRatio", a.getDeviationRatio());
                    anomalyList.add(m);
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("totalChecked", resp.getTotalChecked());
            result.put("anomalyCount", anomalyList.size());
            result.put("anomalies", anomalyList);

            if (!anomalyList.isEmpty()) {
                long criticalCount = anomalyList.stream()
                        .filter(a -> "critical".equals(a.get("severity"))).count();
                long warningCount = anomalyList.stream()
                        .filter(a -> "warning".equals(a.get("severity"))).count();
                if (criticalCount > 0) {
                    result.put("alert", "🔴 发现 " + criticalCount + " 个严重异常 + " + warningCount + " 个警告");
                } else if (warningCount > 0) {
                    result.put("alert", "🟡 发现 " + warningCount + " 个警告");
                }
            } else {
                result.put("summary", "✅ 今日生产无异常");
            }

            return JSON.writeValueAsString(result);
        } catch (Exception e) {
            log.error("[AnomalyDetectionTool] 检测异常", e);
            return errorJson("异常检测失败: " + e.getMessage());
        }
    }
}
