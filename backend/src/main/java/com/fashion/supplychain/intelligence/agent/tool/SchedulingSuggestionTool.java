package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.SchedulingSuggestionRequest;
import com.fashion.supplychain.intelligence.dto.SchedulingSuggestionResponse;
import com.fashion.supplychain.intelligence.dto.SchedulingSuggestionResponse.GanttItem;
import com.fashion.supplychain.intelligence.dto.SchedulingSuggestionResponse.SchedulePlan;
import com.fashion.supplychain.intelligence.orchestration.SchedulingSuggestionOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

@Slf4j
@Component
public class SchedulingSuggestionTool extends AbstractAgentTool {

    @Autowired
    private SchedulingSuggestionOrchestrator schedulingSuggestionOrchestrator;

    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_scheduling_suggestion";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("style_no", prop("string", "款式编号，可选"));
        props.put("quantity", prop("integer", "订单数量，默认1000"));
        props.put("deadline", prop("string", "期望完工日期 yyyy-MM-dd，可选"));
        props.put("product_category", prop("string", "品类（女装/男装/童装等），可选"));

        AiTool tool = new AiTool();
        AiTool.AiFunction fn = new AiTool.AiFunction();
        fn.setName(getName());
        fn.setDescription("排产建议工具：基于工厂真实历史数据（产能/交期达成率/品类匹配/完成质量四维度评分）推荐最优排产方案，含甘特图。"
                + "当用户问\"排到哪个工厂最快\"\"帮我排产\"\"哪个工厂合适\"\"排产建议\"时调用此工具。"
                + "【重要】标注为可选的参数不要追问用户，直接用默认值或不传执行。只有必填参数缺失时才追问。");
        AiTool.AiParameters params = new AiTool.AiParameters();
        params.setProperties(props);
        fn.setParameters(params);
        tool.setFunction(fn);
        return tool;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        try {
            JsonNode args = JSON.readTree(argumentsJson);
            SchedulingSuggestionRequest req = new SchedulingSuggestionRequest();
            req.setStyleNo(args.path("style_no").asText("").trim());
            req.setQuantity(args.path("quantity").asInt(1000));
            req.setDeadline(args.path("deadline").asText("").trim());
            req.setProductCategory(args.path("product_category").asText("").trim());

            log.info("[SchedulingSuggestionTool] 排产建议: styleNo={}, qty={}, category={}",
                    req.getStyleNo(), req.getQuantity(), req.getProductCategory());

            SchedulingSuggestionResponse resp = schedulingSuggestionOrchestrator.suggest(req);

            List<Map<String, Object>> planList = new ArrayList<>();
            if (resp.getPlans() != null) {
                for (SchedulePlan p : resp.getPlans()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("factoryName", p.getFactoryName());
                    m.put("matchScore", p.getMatchScore());
                    m.put("currentLoad", p.getCurrentLoad());
                    m.put("dailyCapacity", p.getDailyCapacity());
                    m.put("capacitySource", p.getCapacitySource());
                    m.put("availableCapacity", p.getAvailableCapacity());
                    m.put("suggestedStart", p.getSuggestedStart());
                    m.put("estimatedEnd", p.getEstimatedEnd());
                    m.put("estimatedDays", p.getEstimatedDays());
                    m.put("fastestDays", p.getFastestDays());
                    m.put("slowestDays", p.getSlowestDays());
                    m.put("earliestEnd", p.getEarliestEnd());
                    m.put("latestEnd", p.getLatestEnd());
                    m.put("capacityScore", p.getCapacityScore());
                    m.put("timeScore", p.getTimeScore());
                    m.put("categoryScore", p.getCategoryScore());
                    m.put("qualityScore", p.getQualityScore());
                    m.put("hasRealData", p.isHasRealData());
                    m.put("dataNote", p.getDataNote());
                    if (p.getGanttItems() != null) {
                        List<Map<String, Object>> gantt = new ArrayList<>();
                        for (GanttItem g : p.getGanttItems()) {
                            Map<String, Object> gi = new LinkedHashMap<>();
                            gi.put("stage", g.getStage());
                            gi.put("startDate", g.getStartDate());
                            gi.put("endDate", g.getEndDate());
                            gi.put("days", g.getDays());
                            gantt.add(gi);
                        }
                        m.put("ganttItems", gantt);
                    }
                    planList.add(m);
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("plans", planList);
            if (resp.getOptimizationHint() != null) {
                result.put("optimizationHint", resp.getOptimizationHint());
            }

            return JSON.writeValueAsString(result);
        } catch (Exception e) {
            log.error("[SchedulingSuggestionTool] 排产建议异常", e);
            return errorJson("排产建议失败: " + e.getMessage());
        }
    }
}
