package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
public class AiAgentOrchestrator {

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Autowired
    private List<AgentTool> registeredTools;

    private Map<String, AgentTool> toolMap;
    private List<AiTool> apiTools;

    @PostConstruct
    public void init() {
        toolMap = new HashMap<>();
        apiTools = new ArrayList<>();
        if (registeredTools != null) {
            for (AgentTool tool : registeredTools) {
                toolMap.put(tool.getName(), tool);
                apiTools.add(tool.getToolDefinition());
                log.info("[AiAgent] 已注册工具: {}", tool.getName());
            }
        }
    }

    public Result<String> executeAgent(String userMessage) {
        if (!inferenceOrchestrator.isAnyModelEnabled()) {
            return Result.fail("智能服务暂未配置或不可用");
        }

        List<AiMessage> messages = new ArrayList<>();
        // System Prompt: 你是一个服装供应链管理系统的全能AI助手。
        String systemPrompt = "你是一个专业且全能的服装供应链管理系统AI智能助理（代号：小云）。\n" +
            "目前的架构已经升级为真正的Agent环境。通过调用工具函数，你可以访问系统中所有实时数据（包含但不限于款式、单价、工序、生产进度、财务结算、进销存、客户、员工等）。\n" +
            "【行为规范】：\n" +
            "1. 必须优先使用工具查询解答问题。严禁凭空捏造数据。\n" +
            "2. 如果用户要求生成智能日报、周报或月报，不要推脱或说明没有权限。请直接调用如生产进度、工具库存、员工等至少2-3个查询工具，抓取本系统内的真实近期数据，整理并用清晰的美观排版（如项目符号、分行）为日报/周报提交给用户。\n" +
            "3. 在返回内容的最后，你必须换行并根据上下文推荐3个相关的追问问题或探索方向给用户，格式固定为：\n" +
            "【推荐追问】：问题1 | 问题2 | 问题3";
        
        messages.add(AiMessage.system(systemPrompt));
        messages.add(AiMessage.user(userMessage));

        int maxIterations = 5;
        int currentIter = 0;

        while (currentIter < maxIterations) {
            currentIter++;
            log.info("[AiAgent] 开始第 {} 轮思考...", currentIter);
            
            IntelligenceInferenceResult result = inferenceOrchestrator.chat("agent-loop", messages, apiTools);
            if (!result.isSuccess()) {
                log.error("[AiAgent] 推理失败: {}", result.getErrorMessage());
                return Result.fail("推理服务暂时不可用: " + result.getErrorMessage());
            }

            // LLM Response
            AiMessage assistantMessage = AiMessage.assistant(result.getContent());
            
            // Handle Tool Calls
            if (result.getToolCalls() != null && !result.getToolCalls().isEmpty()) {
                assistantMessage.setTool_calls(result.getToolCalls());
                messages.add(assistantMessage);

                for (AiToolCall toolCall : result.getToolCalls()) {
                    String toolName = toolCall.getFunction().getName();
                    String args = toolCall.getFunction().getArguments();
                    log.info("[AiAgent] LLM 决定调用工具: {} | args: {}", toolName, args);

                    AgentTool tool = toolMap.get(toolName);
                    String toolResult;
                    if (tool == null) {
                        toolResult = "{\"error\": \"工具不存在: " + toolName + "\"}";
                    } else {
                        try {
                            toolResult = tool.execute(args);
                        } catch (Exception e) {
                            log.error("[AiAgent] 工具执行异常", e);
                            toolResult = "{\"error\": \"执行失败: " + e.getMessage() + "\"}";
                        }
                    }
                    log.info("[AiAgent] 工具调用结果:\n{}", toolResult);
                    messages.add(AiMessage.tool(toolResult, toolCall.getId(), toolName));
                }
            } else {
                // Done!
                log.info("[AiAgent] 完成任务，返回给用户");
                return Result.success(result.getContent());
            }
        }
        
        return Result.fail("对话轮数超过限制 (" + maxIterations + ")，可能陷入了死循环。");
    }
}
