package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.agent.loop.EnhancedStreamingCallback;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.agent.tool.McpToolScanner;
import com.fashion.supplychain.intelligence.agent.tool.ToolDiscoveryRag;
import com.fashion.supplychain.intelligence.gateway.ModelConsortiumRouter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 小云核心升级集成器 — 将所有新能力统一接入运行循环。
 * <p>
 * 单一入口点，负责：
 * <ol>
 *   <li>智能工具筛选（ToolDiscoveryRag 替代全量工具列表）</li>
 *   <li>模型智能路由（ModelConsortiumRouter 替代固定模型）</li>
 *   <li>数字孪生注入（FullDigitalTwin 扩展到全模块）</li>
 *   <li>增强流式事件（EnhancedStreamingCallback 替代基础 SSE）</li>
 * </ol>
 * </p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class XiaoyunCoreUpgrade {

    private final ToolDiscoveryRag toolDiscoveryRag;
    private final ModelConsortiumRouter modelRouter;
    private final FullDigitalTwinBuilder digitalTwin;
    private final McpToolScanner toolScanner;

    @Value("${xiaoyun.agent.tool-discovery.enabled:true}")
    private boolean toolDiscoveryEnabled;

    @Value("${xiaoyun.agent.tool-discovery.min-tool-count-for-rag:30}")
    private int minToolCountForRag;

    @Value("${xiaoyun.agent.tool-discovery.top-k:10}")
    private int toolDiscoveryTopK;

    @Value("${xiaoyun.digital-twin.enabled:true}")
    private boolean digitalTwinEnabled;

    // ===== 工具筛选 =====

    /**
     * 智能筛选工具 — 如果工具数量超过阈值，使用 RAG 筛选最相关工具。
     * 否则返回原列表。
     */
    public List<AgentTool> filterTools(
            List<AgentTool> allTools,
            String userMessage,
            String pageContext) {

        if (!toolDiscoveryEnabled || allTools == null || allTools.size() < minToolCountForRag) {
            return allTools; // 工具少，不需要筛选
        }

        // RAG 搜索最相关工具
        List<McpToolScanner.McpToolMeta> relevantMetas = toolDiscoveryRag.searchTools(
                userMessage, pageContext, toolDiscoveryTopK);

        // 将元数据映射回 AgentTool 实例
        java.util.Set<String> relevantNames = new java.util.HashSet<>();
        for (McpToolScanner.McpToolMeta meta : relevantMetas) {
            relevantNames.add(meta.name());
        }

        List<AgentTool> filtered = allTools.stream()
                .filter(t -> {
                    String name = t.getName();
                    // 始终包含 think tool
                    if ("tool_think".equals(name)) return true;
                    return relevantNames.contains(name);
                })
                .toList();

        log.info("[CoreUpgrade] 工具筛选: {}/{} → {}. 关键词: {}",
                filtered.size(), allTools.size(), relevantMetas.size(),
                userMessage != null && userMessage.length() > 30
                        ? userMessage.substring(0, 30) + "..."
                        : userMessage);

        return filtered;
    }

    // ===== 模型选择 =====

    /**
     * 根据用户查询复杂度选择最优模型。
     *
     * @return 选中的模型名称
     */
    public String selectModel(String userMessage, boolean hasImage, int toolCount) {
        String model = modelRouter.selectModel(userMessage, hasImage, toolCount);
        log.info("[CoreUpgrade] 模型选择: {} (hasImage={}, toolCount={})", model, hasImage, toolCount);
        return model;
    }

    /**
     * 获取模型推荐参数
     */
    public ModelConsortiumRouter.ModelParams getModelParams(String userMessage, boolean hasImage, int toolCount) {
        ModelConsortiumRouter.Complexity complexity = modelRouter.classifyComplexity(
                userMessage, hasImage, toolCount);
        return modelRouter.getModelParams(complexity);
    }

    // ===== 数字孪生 =====

    /**
     * 构建全模块数字孪生快照并注入到提示词。
     *
     * @return 数字孪生提示词块（如未启用则返回空字符串）
     */
    public String buildDigitalTwinPrompt() {
        if (!digitalTwinEnabled) return "";
        try {
            FullDigitalTwinBuilder.FullSnapshot snapshot = digitalTwin.buildSnapshot();
            if (snapshot != null) {
                return snapshot.toPromptBlock();
            }
        } catch (Exception e) {
            log.warn("[CoreUpgrade] 数字孪生构建失败: {}", e.getMessage());
        }
        return "";
    }

    // ===== 增强流式 =====

    /**
     * 创建增强流式回调（在 StreamingAgentLoopCallback 基础上增加进度/动画/时间预算）。
     */
    public EnhancedStreamingCallback createEnhancedCallback() {
        return new EnhancedStreamingCallback();
    }

    // ===== 状态查询（供管理面板） =====

    /**
     * 获取升级状态摘要
     */
    public Map<String, Object> getUpgradeStatus() {
        Map<String, Object> status = new java.util.LinkedHashMap<>();
        status.put("toolDiscoveryEnabled", toolDiscoveryEnabled);
        status.put("toolDiscoveryMinCount", minToolCountForRag);
        status.put("toolDiscoveryTopK", toolDiscoveryTopK);
        status.put("digitalTwinEnabled", digitalTwinEnabled);
        status.put("totalTools", toolScanner.getToolCount());
        status.put("annotatedTools",
                toolScanner.getAllToolMetas().stream()
                        .filter(m -> m.jsonSchema() != null && !m.jsonSchema().isBlank())
                        .count());
        status.put("domainDistribution", toolScanner.getDomainDistribution());
        status.put("modelConfig", modelRouter.getConfig());
        return status;
    }
}
