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
 *   <li>所有 list/read 必须带 tenantId（或完整 {@link McpIdentityContext}）</li>
 *   <li>禁止跨租户读取（如 A 工厂读取 B 工厂的记忆 = P0 事故）</li>
 * </ul>
 *
 * <p>实现示例：
 * <ul>
 *   <li>{@code memory://} → MemoryBankResourceProvider（5 类记忆）</li>
 *   <li>{@code knowledge://} → KnowledgeBaseResourceProvider（知识库条目）</li>
 *   <li>{@code factory://} → FactoryProfileResourceProvider（工厂画像）</li>
 * </ul>
 *
 * <p>2026-06-20 升级（P0-2 MCP 生产化）：
 * <ul>
 *   <li>新增 {@link McpIdentityContext} 重载方法（身份全链路传播，向后兼容）</li>
 *   <li>新增 {@link #toolType()} 用于 ATBA 自适应超时预算</li>
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
     * @return 资源内容（contents 数组）；失败时填充 error 字段（SERF）
     */
    McpResourceReadResult readResource(String uri, Long tenantId);

    // ─────────────────────────────────────────────────────────────────────
    // 2026-06-20 新增：身份传播 + ATBA 超时预算（默认方法，向后兼容）
    // ─────────────────────────────────────────────────────────────────────

    /**
     * 列出资源（带完整身份上下文）。
     *
     * <p>默认委托给 {@link #listResources(Long)}，子类可覆写以做细粒度权限校验。
     *
     * @param identity 身份上下文（tenantId/userId/roles/permissions）
     * @return 资源元数据列表
     */
    default List<McpResource> listResources(McpIdentityContext identity) {
        return listResources(identity.getTenantId());
    }

    /**
     * 读取资源（带完整身份上下文）。
     *
     * <p>默认委托给 {@link #readResource(String, Long)}，子类可覆写以做细粒度权限校验。
     *
     * @param uri      资源 URI
     * @param identity 身份上下文
     * @return 资源内容；失败时填充 error 字段（SERF）
     */
    default McpResourceReadResult readResource(String uri, McpIdentityContext identity) {
        return readResource(uri, identity.getTenantId());
    }

    /**
     * 工具类型（用于 ATBA 自适应超时预算）。
     *
     * <p>可选覆写，默认 "DEFAULT"（15s 预算）。
     * 可选值：QUERY(5s) / REPORT(30s) / COMPUTATION(120s) / DEFAULT(15s)
     *
     * @return 工具类型字符串
     */
    default String toolType() {
        return "DEFAULT";
    }
}
