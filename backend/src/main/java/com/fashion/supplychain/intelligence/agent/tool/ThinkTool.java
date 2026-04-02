package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * ThinkTool — AI 主动思考工具（灵感来自 Claude Code tau-bench 设计）
 *
 * <p>这是一个 no-op 工具：AI 在处理复杂任务前主动调用，把推理过程写入 arguments，
 * 工具本身不执行任何副作用，只返回确认信号。
 *
 * <p>核心价值：让 AI 能在 ReAct 循环中自主决定"先停下来想想"，
 * 把思考内容作为 tool_result 写入消息历史，为后续工具调用提供更精准的依据。
 * 相比系统固定发出 SSE thinking 事件，AI 主动思考对复杂推理场景有显著提升。
 *
 * <p>适用场景：
 * 1. 问题涉及 3 个以上数据维度（订单 + 工厂 + 时间 + 财务等复合查询）
 * 2. 需要规划多步工具调用顺序
 * 3. 需要风险判断、进度推算、成本估算
 * 4. 用户给出模糊指令需要拆解理解
 * 5. 工具返回结果与预期不符需要重新推理
 */
@Component
public class ThinkTool implements AgentTool {

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

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("在处理复杂任务前用于主动思考推理。当你需要分析复合问题、规划多步工具调用顺序、"
                + "做风险判断或推算时，请先调用此工具，将完整分析思路写入 thought 参数，再执行实际操作。"
                + "此工具无任何副作用，仅记录思考过程，请在必要时大胆调用。");
        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        function.setParameters(aiParams);
        tool.setFunction(function);

        return tool;
    }

    @Override
    public String execute(String argumentsJson) {
        // No-op：AI 的思考内容已作为 arguments 写入消息历史，此处只返回确认信号
        return "思考已记录，请根据以上分析继续执行任务。";
    }
}
