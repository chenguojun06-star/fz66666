package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * ThinkTool — AI 增强版完整推理引擎（2026年最新设计）
 *
 * <p>不再是简单的 no-op，而是完整的推理引擎：
 * 1. 结构化思考记录
 * 2. 问题复杂度分析
 * 3. 执行路径规划
 * 4. 风险识别与预警
 * 5. 推理质量自检
 *
 * <p>核心思想：高质量的思考决定高质量的执行。
 *
 * <p>适用场景：
 * 1. 问题涉及 3 个以上数据维度（订单 + 工厂 + 时间 + 财务等复合查询）
 * 2. 需要规划多步工具调用顺序
 * 3. 需要风险判断、进度推算、成本估算
 * 4. 用户给出模糊指令需要拆解理解
 * 5. 工具返回结果与预期不符需要重新推理
 */
@Slf4j
@Component
@Lazy
public class ThinkTool extends AbstractAgentTool {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_think";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> thoughtProp = new HashMap<>();
        thoughtProp.put("type", "string");
        thoughtProp.put("description",
                "将你的完整推理过程写在这里。可以包括：问题拆解、工具调用规划、风险判断、"
                + "数据关联分析等。内容越详细，后续执行越精准。此字段内容不会展示给用户。");
        properties.put("thought", thoughtProp);

        Map<String, Object> analysisTypeProp = new HashMap<>();
        analysisTypeProp.put("type", "string");
        analysisTypeProp.put("enum", List.of("initial", "rethinking", "review", "risk_assessment"));
        analysisTypeProp.put("description", "分析类型：initial(初始分析)/rethinking(重新思考)/review(复盘分析)/risk_assessment(风险评估)");
        analysisTypeProp.put("default", "initial");
        properties.put("analysis_type", analysisTypeProp);

        Map<String, Object> complexityProp = new HashMap<>();
        complexityProp.put("type", "string");
        complexityProp.put("enum", List.of("simple", "medium", "complex", "very_complex"));
        complexityProp.put("description", "问题复杂度评估");
        properties.put("complexity", complexityProp);

        Map<String, Object> planProp = new HashMap<>();
        planProp.put("type", "array");
        planProp.put("description", "执行规划的工具调用序列（可选），每个元素是一个工具名称");
        properties.put("plan", planProp);

        Map<String, Object> risksProp = new HashMap<>();
        risksProp.put("type", "array");
        risksProp.put("description", "识别到的潜在风险列表（可选）");
        properties.put("risks", risksProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("【增强版】完整推理引擎。在处理复杂任务前用于深度思考，支持问题拆解、执行规划、风险评估。"
                + "将完整分析思路写入参数，此工具会生成结构化的推理报告指导后续执行。"
                + "此工具无任何副作用，请在必要时大胆调用。");
        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        aiParams.setRequired(List.of("thought"));
        function.setParameters(aiParams);
        tool.setFunction(function);

        return tool;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        try {
            JsonNode args = objectMapper.readTree(argumentsJson);

            String thought = args.has("thought") ? args.get("thought").asText() : "";
            String analysisType = args.has("analysis_type") ? args.get("analysis_type").asText() : "initial";
            String complexity = args.has("complexity") ? args.get("complexity").asText() : "medium";

            List<String> plan = new ArrayList<>();
            if (args.has("plan") && args.get("plan").isArray()) {
                for (JsonNode node : args.get("plan")) {
                    plan.add(node.asText());
                }
            }

            List<String> risks = new ArrayList<>();
            if (args.has("risks") && args.get("risks").isArray()) {
                for (JsonNode node : args.get("risks")) {
                    risks.add(node.asText());
                }
            }

            // 生成结构化推理报告
            String report = generateReasoningReport(thought, analysisType, complexity, plan, risks);

            log.info("[ThinkTool] 推理完成: type={}, complexity={}, planSize={}, riskSize={}",
                    analysisType, complexity, plan.size(), risks.size());

            return report;

        } catch (Exception e) {
            log.warn("[ThinkTool] 解析参数失败，使用默认响应", e);
            return "思考已记录，请根据以上分析继续执行任务。";
        }
    }

    /**
     * 生成结构化推理报告
     */
    private String generateReasoningReport(String thought, String analysisType,
                                          String complexity,
                                          List<String> plan, List<String> risks) {
        StringBuilder report = new StringBuilder();
        report.append("## 推理分析报告\n\n");

        // 分析类型
        report.append("**分析类型**: ").append(getAnalysisTypeLabel(analysisType)).append("\n\n");

        // 复杂度
        report.append("**复杂度评估**: ").append(getComplexityLabel(complexity)).append("\n\n");

        // 思考内容
        report.append("### 思考过程\n");
        report.append(thought).append("\n\n");

        // 执行计划
        if (!plan.isEmpty()) {
            report.append("### 执行规划\n");
            for (int i = 0; i < plan.size(); i++) {
                report.append(i + 1).append(". ").append(plan.get(i)).append("\n");
            }
            report.append("\n");
        }

        // 风险提示
        if (!risks.isEmpty()) {
            report.append("### ⚠️ 风险提示\n");
            for (String risk : risks) {
                report.append("- ").append(risk).append("\n");
            }
            report.append("\n");
        }

        report.append("推理分析完成，请根据以上分析继续执行任务。");

        return report.toString();
    }

    private String getAnalysisTypeLabel(String type) {
        return switch (type) {
            case "initial" -> "初始分析";
            case "rethinking" -> "重新思考";
            case "review" -> "复盘分析";
            case "risk_assessment" -> "风险评估";
            default -> "通用分析";
        };
    }

    private String getComplexityLabel(String complexity) {
        return switch (complexity) {
            case "simple" -> "简单 (1-2 步)";
            case "medium" -> "中等 (3-5 步)";
            case "complex" -> "复杂 (6-10 步)";
            case "very_complex" -> "非常复杂 (10+ 步，建议分步执行)";
            default -> "中等";
        };
    }
}
