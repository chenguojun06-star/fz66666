package com.fashion.supplychain.intelligence.agent.resource;

import com.fashion.supplychain.common.UserContext;
import lombok.Builder;
import lombok.Data;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * MCP 身份上下文 — 全链路身份传播值对象。
 *
 * <p>背景：原 {@link McpResourceProvider} 只带 tenantId，缺 userId/roles/permissions，
 * 导致 ResourceProvider 无法做细粒度权限校验（如"仅创建者可读"、"仅主管可读"）。
 *
 * <p>本类作为不可变值对象在 Controller → Service → Provider 间传递，
 * 替代裸 Long tenantId，让权限决策有完整上下文。
 *
 * <p>多租户隔离（P0 铁律 4 + 15）：
 * <ul>
 *   <li>tenantId 必须来自 {@link UserContext#tenantId()}，禁止从 URI/参数注入</li>
 *   <li>跨租户读取 = P0 事故</li>
 * </ul>
 */
@Data
@Builder
public class McpIdentityContext {

    /** 租户 ID（多租户隔离核心字段，必填） */
    private final Long tenantId;

    /** 用户 ID（用于细粒度权限校验，如"仅创建者可读"） */
    private final String userId;

    /** 用户名（用于审计日志） */
    private final String username;

    /** 角色集合（如 {"admin", "manager"}） */
    @Builder.Default
    private final Set<String> roles = Collections.emptySet();

    /** 权限集合（如 {"memory:read", "knowledge:read"}） */
    @Builder.Default
    private final Set<String> permissions = Collections.emptySet();

    /** 请求追踪 ID（用于日志关联，自动生成） */
    @Builder.Default
    private final String requestId = UUID.randomUUID().toString();

    /** 是否为租户主账号 */
    private final boolean tenantOwner;

    /** 是否为平台超级管理员 */
    private final boolean superAdmin;

    /**
     * 从 {@link UserContext}（ThreadLocal）构建身份上下文。
     *
     * <p>调用时机：Controller 入口、Service 入口。
     * 必须在请求线程内调用（异步线程需先用 {@link UserContext#wrap} 传递）。
     *
     * @return 身份上下文；UserContext 不存在时返回带默认 tenantId=1L 的降级上下文
     */
    public static McpIdentityContext fromUserContext() {
        UserContext uc = UserContext.get();
        if (uc == null) {
            // MCP 端点可能无用户上下文（如内部任务），降级为默认租户
            return McpIdentityContext.builder()
                    .tenantId(1L)
                    .userId("system")
                    .username("system")
                    .roles(Collections.emptySet())
                    .permissions(Collections.emptySet())
                    .build();
        }

        Set<String> roles = new HashSet<>();
        if (uc.getRole() != null && !uc.getRole().isBlank()) {
            roles.add(uc.getRole());
        }

        return McpIdentityContext.builder()
                .tenantId(uc.getTenantId() != null ? uc.getTenantId() : 1L)
                .userId(uc.getUserId())
                .username(uc.getUsername())
                .roles(roles)
                .permissions(Collections.emptySet())
                .tenantOwner(uc.getTenantOwner())
                .superAdmin(uc.getSuperAdmin())
                .build();
    }

    /**
     * 判断是否拥有某权限。
     */
    public boolean hasPermission(String permission) {
        return permissions != null && permissions.contains(permission);
    }

    /**
     * 判断是否拥有某角色。
     */
    public boolean hasRole(String role) {
        return roles != null && roles.contains(role);
    }
}
