package com.fashion.supplychain.intelligence.agent.resource;

import com.fashion.supplychain.intelligence.service.McpProtocolService.McpResource;
import com.fashion.supplychain.intelligence.service.McpProtocolService.McpResourceReadResult;

import java.util.List;

/**
 * MCP Resource Provider 接口（MCP v2024-11-05 resources capability）。
 *
 * <p>每个实现类负责一类资源的 list + read，通过 URI 前缀路由。
 *
 * <p>多租户隔离（P0 铁律 4 + 15）：
 * <ul>
 *   <li>所有 list/read 必须带 tenantId</li>
 *   <li>禁止跨租户读取（如 A 工厂读取 B 工厂的记忆 = P0 事故）</li>
 * </ul>
 *
 * <p>实现示例：
 * <ul>
 *   <li>{@code memory://} → MemoryBankResourceProvider（5 类记忆）</li>
 *   <li>{@code knowledge://} → KnowledgeBaseResourceProvider（知识库条目）</li>
 *   <li>{@code factory://} → FactoryProfileResourceProvider（工厂画像）</li>
 * </ul>
 */
public interface McpResourceProvider {

    /**
     * 是否支持该 URI（通常按前缀匹配）。
     *
     * @param uri 资源 URI（如 "memory://active-context"）
     * @return true 表示本 Provider 可处理该 URI
     */
    boolean supports(String uri);

    /**
     * 列出本 Provider 暴露的所有资源（MCP resources/list）。
     *
     * @param tenantId 租户 ID（用于多租户隔离）
     * @return 资源元数据列表（uri/name/description/mimeType）
     */
    List<McpResource> listResources(Long tenantId);

    /**
     * 读取指定 URI 的资源内容（MCP resources/read）。
     *
     * @param uri      资源 URI
     * @param tenantId 租户 ID（用于多租户隔离）
     * @return 资源内容（contents 数组）
     */
    McpResourceReadResult readResource(String uri, Long tenantId);
}
