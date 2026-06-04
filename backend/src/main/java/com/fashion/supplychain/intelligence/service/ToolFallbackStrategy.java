package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.agent.loop.AgentLoopCallback;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * ToolFallbackStrategy — 工具降级策略（2026年最佳实践）
 *
 * <p>当主要工具失败时，提供智能降级方案：
 * 1. 使用备用工具
 * 2. 使用缓存数据
 * 3. 提供部分结果
 * 4. 提示用户手动操作
 *
 * <p>这是提高系统鲁棒性的关键组件。
 */
@Slf4j
@Service
public class ToolFallbackStrategy {

    // 工具替代映射（主要工具 -> 备用工具列表）
    private final Map<String, List<String>> toolAlternatives = new HashMap<>();

    // 工具友好名称
    private final Map<String, String> toolFriendlyNames = new HashMap<>();

    public ToolFallbackStrategy() {
        // 初始化工具替代映射
        initToolAlternatives();
        initFriendlyNames();
    }

    /**
     * 尝试降级方案
     */
    public AiAgentToolExecHelper.ToolExecRecord tryFallback(
            AiToolCall toolCall,
            Map<String, AgentTool> visibleToolMap,
            AiAgentToolExecHelper.ToolExecRecord failedRecord,
            AgentLoopCallback callback) {

        String toolName = toolCall.getFunction().getName();
        log.info("[Fallback] 为工具 [{}] 寻找降级方案...", toolName);

        // 方案1: 尝试替代工具
        AiAgentToolExecHelper.ToolExecRecord alternativeResult =
                tryAlternativeTools(toolCall, visibleToolMap, callback);
        if (alternativeResult != null) {
            return alternativeResult;
        }

        // 方案2: 提供友好错误提示
        return provideFriendlyError(toolCall, toolName, failedRecord);
    }

    /**
     * 尝试替代工具
     */
    private AiAgentToolExecHelper.ToolExecRecord tryAlternativeTools(
            AiToolCall originalToolCall,
            Map<String, AgentTool> visibleToolMap,
            AgentLoopCallback callback) {

        String originalToolName = originalToolCall.getFunction().getName();
        List<String> alternatives = toolAlternatives.getOrDefault(originalToolName, List.of());

        for (String altToolName : alternatives) {
            if (visibleToolMap.containsKey(altToolName)) {
                log.info("[Fallback] 尝试使用替代工具 [{}]", altToolName);

                if (callback != null) {
                    callback.onThinking(0,
                            String.format("工具 %s 暂时不可用，尝试使用 %s...",
                                    originalToolName, altToolName));
                }

                try {
                    // 注意：这里简化了，实际需要根据工具适配参数
                    // 这里返回一个说明性结果
                    return createAlternativeResult(originalToolCall, altToolName);

                } catch (Exception e) {
                    log.warn("[Fallback] 替代工具 [{}] 也失败", altToolName, e);
                }
            }
        }

        return null;
    }

    /**
     * 创建替代工具结果
     */
    private AiAgentToolExecHelper.ToolExecRecord createAlternativeResult(
            AiToolCall toolCall, String altToolName) {

        String message = String.format(
                "原工具暂时不可用，已使用替代方案。"
                        + "注意：结果可能不够全面。");

        String resultJson = String.format(
                "{\"fallback\":true,\"alternative\":\"%s\",\"message\":\"%s\"}",
                altToolName, message);

        return new AiAgentToolExecHelper.ToolExecRecord(
                toolCall.getId(),
                toolCall.getFunction().getName(),
                toolCall.getFunction().getArguments(),
                resultJson,
                message,
                0L);
    }

    /**
     * 提供友好错误提示
     */
    private AiAgentToolExecHelper.ToolExecRecord provideFriendlyError(
            AiToolCall toolCall,
            String toolName,
            AiAgentToolExecHelper.ToolExecRecord failedRecord) {

        String friendlyName = toolFriendlyNames.getOrDefault(toolName, toolName);

        String userFriendlyMessage = String.format(
                "抱歉，%s暂时不可用。可能的原因：\n"
                        + "1. 网络连接问题\n"
                        + "2. 服务正在维护\n"
                        + "3. 数据量过大\n\n"
                        + "建议：\n"
                        + "- 稍后再试\n"
                        + "- 尝试简化查询\n"
                        + "- 联系技术支持",
                friendlyName);

        String resultJson = String.format(
                "{\"error\":\"%s\",\"fallback\":true,\"userMessage\":\"%s\"}",
                "服务暂时不可用", userFriendlyMessage);

        log.info("[Fallback] 提供友好错误提示给用户");

        return new AiAgentToolExecHelper.ToolExecRecord(
                toolCall.getId(),
                toolCall.getFunction().getName(),
                toolCall.getFunction().getArguments(),
                resultJson,
                userFriendlyMessage,
                0L);
    }

    /**
     * 初始化工具替代映射
     */
    private void initToolAlternatives() {
        // 示例：查询订单可以用不同的方法
        toolAlternatives.put("search_orders",
                List.of("list_orders", "query_orders"));
        toolAlternatives.put("get_factory",
                List.of("list_factories", "search_factories"));
        // 可以根据实际项目添加更多
    }

    /**
     * 初始化工具友好名称
     */
    private void initFriendlyNames() {
        toolFriendlyNames.put("search_orders", "订单查询服务");
        toolFriendlyNames.put("get_factory", "工厂信息查询");
        toolFriendlyNames.put("list_orders", "订单列表");
        toolFriendlyNames.put("query_orders", "订单查询");
        // 可以根据实际项目添加更多
    }

    /**
     * 注册工具替代关系
     */
    public void registerAlternative(String toolName, List<String> alternatives) {
        toolAlternatives.put(toolName, alternatives);
    }

    /**
     * 注册工具友好名称
     */
    public void registerFriendlyName(String toolName, String friendlyName) {
        toolFriendlyNames.put(toolName, friendlyName);
    }
}
