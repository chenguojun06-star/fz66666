package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.ExecutableCommand;
import com.fashion.supplychain.intelligence.dto.ExecutionDecision;
import com.fashion.supplychain.intelligence.dto.ExecutionDecision.ExecutionDecisionType;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 权限决策编排器
 *
 * 职责：
 *   1. 判断一个命令是否可以直接执行
 *   2. 需要人工确认则返回相应信息
 *   3. 无权限则拒绝
 *
 * 决策逻辑：
 *   ├─ 检查命令是否过期
 *   ├─ 检查用户权限
 *   ├─ 检查租户配置
 *   ├─ 根据风险等级判断
 *   └─ 输出决策：【自动执行】【需要确认】【拒绝】
 *
 * @author Permission Decision Engine v1.0
 * @date 2026-03-08
 */
@Slf4j
@Service
public class PermissionDecisionOrchestrator {

    @Autowired
    private UserService userService;

    // 租户级别的自动化设置缓存（带5分钟TTL）
    private final ConcurrentHashMap<Long, CachedConfig> autoConfigCache = new ConcurrentHashMap<>();
    private static final long CONFIG_CACHE_TTL_MS = 5 * 60 * 1000L;

    /**
     * 核心方法：决定命令执行方式
     *
     * @param command 待执行的命令
     * @param currentUserId 当前用户ID
     * @return 执行决策
     */
    public ExecutionDecision decide(ExecutableCommand command, Long currentUserId) {

        log.info("[PermissionDecision] 正在决策命令: action={}, riskLevel={}, userId={}",
            command.getAction(), command.getRiskLevel(), currentUserId);

        // 1. 检查命令是否过期
        if (command.isExpired()) {
            log.warn("[PermissionDecision] 命令已过期: commandId={}", command.getCommandId());
            return ExecutionDecision.builder()
                .decision(ExecutionDecisionType.DENIED)
                .reason("命令已过期，无法执行")
                .riskScore(0)
                .build();
        }

        // 2. 检查用户是否存在
        User currentUser = userService.getById(currentUserId);
        if (currentUser == null) {
            log.warn("[PermissionDecision] 用户不存在: userId={}", currentUserId);
            return ExecutionDecision.builder()
                .decision(ExecutionDecisionType.DENIED)
                .reason("用户不存在或已被禁用")
                .riskScore(0)
                .build();
        }

        // 3. 检查租户是否启用了该功能
        Long tenantId = command.getTenantId();
        TenantAutoConfig config = getTenantConfig(tenantId);
        if (!config.isAutoExecutionEnabled()) {
            log.info("[PermissionDecision] 租户未启用自动化: tenantId={}", tenantId);
            return ExecutionDecision.builder()
                .decision(ExecutionDecisionType.REQUIRES_APPROVAL)
                .reason("租户未启用自动化，所有命令需要人工确认")
                .requiredApprovalRoles(new String[]{"MANAGER", "ADMIN"})
                .estimatedWaitTimeSeconds(300)
                .riskScore(3)
                .build();
        }

        // 4. 检查命令的权限要求
        String[] requiredRoles = getRequiredRolesForCommand(command.getAction());
        if (!userHasAnyRole(currentUser, requiredRoles)) {
            log.warn("[PermissionDecision] 用户权限不足: action={}, userId={}",
                command.getAction(), currentUserId);
            return ExecutionDecision.builder()
                .decision(ExecutionDecisionType.DENIED)
                .reason("您没有权限执行此命令，需要 " + String.join(" 或 ", requiredRoles) + " 角色")
                .requiredApprovalRoles(requiredRoles)
                .riskScore(5)
                .build();
        }

        // 5. 根据风险等级和租户配置决策
        if (shouldAutoExecute(command, config)) {
            log.info("[PermissionDecision] 命令可自动执行: action={}, riskLevel={}",
                command.getAction(), command.getRiskLevel());
            return ExecutionDecision.builder()
                .decision(ExecutionDecisionType.AUTO_EXECUTE)
                .reason("风险等级 " + command.getRiskLevel() + " 低于自动化阈值 " +
                    config.getAutoExecutionThreshold() + "，可自动执行")
                .riskScore(command.getRiskLevel())
                .build();
        }

        // 6. 需要人工确认
        log.info("[PermissionDecision] 命令需要确认: action={}, riskLevel={}",
            command.getAction(), command.getRiskLevel());

        Integer threshold = config.getAutoExecutionThreshold();
        return ExecutionDecision.builder()
            .decision(ExecutionDecisionType.REQUIRES_APPROVAL)
            .reason("命令风险等级为 " + command.getRiskLevel() + "，超过自动化阈值 " + threshold +
                "，需要 " + getApprovalRolesForCommand(command.getAction()) + " 确认")
            .requiredApprovalRoles(getApprovalRoles(command.getAction()))
            .requiredApprovalCount(1)
            .estimatedWaitTimeSeconds(600)
            .riskScore(command.getRiskLevel())
            .build();
    }

    /**
     * 判断是否应该自动执行
     */
    private boolean shouldAutoExecute(ExecutableCommand command, TenantAutoConfig config) {
        // 低风险命令可自动执行
        if (command.getRiskLevel() <= config.getAutoExecutionThreshold()) {
            // 但要检查命令是否标记了"必须确认"
            if (Boolean.TRUE.equals(command.getRequiresApproval())) {
                return false;
            }
            return true;
        }
        return false;
    }

    /**
     * 获取租户的自动化配置（5分钟缓存TTL）
     */
    private TenantAutoConfig getTenantConfig(Long tenantId) {
        CachedConfig cached = autoConfigCache.get(tenantId);
        if (cached != null && (System.currentTimeMillis() - cached.cachedAt) < CONFIG_CACHE_TTL_MS) {
            return cached.config;
        }
        TenantAutoConfig config = TenantAutoConfig.builder()
                .tenantId(tenantId)
                .autoExecutionEnabled(true)
                .autoExecutionThreshold(2)
                .build();
        autoConfigCache.put(tenantId, new CachedConfig(config, System.currentTimeMillis()));
        return config;
    }

    /** 带时间戳的缓存条目 */
    private static class CachedConfig {
        final TenantAutoConfig config;
        final long cachedAt;
        CachedConfig(TenantAutoConfig config, long cachedAt) {
            this.config = config;
            this.cachedAt = cachedAt;
        }
    }

    /**
     * 获取命令所需的角色
     */
    private String[] getRequiredRolesForCommand(String action) {
        return switch (action) {
            case "order:hold", "order:expedite", "order:resume", "order:approve", "order:reject" ->
                new String[]{"PRODUCTION_MANAGER", "ADMIN"};
            case "style:approve", "style:return" ->
                new String[]{"STYLE_MANAGER", "ADMIN"};
            case "quality:reject" ->
                new String[]{"QC_MANAGER", "PRODUCTION_MANAGER", "ADMIN"};
            case "settlement:approve" ->
                new String[]{"FINANCE_MANAGER", "ADMIN"};
            case "purchase:create" ->
                new String[]{"PROCUREMENT_MANAGER", "PRODUCTION_MANAGER", "ADMIN"};
            default -> new String[]{"USER"};
        };
    }

    /**
     * 获取命令所需的批准角色
     */
    private String[] getApprovalRoles(String action) {
        return switch (action) {
            case "order:hold", "order:expedite", "order:approve", "order:reject" ->
                new String[]{"PRODUCTION_DIRECTOR"};
            case "style:approve", "style:return" ->
                new String[]{"STYLE_DIRECTOR", "ADMIN"};
            case "quality:reject" ->
                new String[]{"QC_DIRECTOR", "PRODUCTION_DIRECTOR"};
            case "settlement:approve" ->
                new String[]{"FINANCE_DIRECTOR"};
            case "purchase:create" ->
                new String[]{"PROCUREMENT_DIRECTOR", "ADMIN"};
            default -> new String[]{"MANAGER"};
        };
    }

    /**
     * 获取批准角色的字符串表示
     */
    private String getApprovalRolesForCommand(String action) {
        return String.join(" 或 ", getApprovalRoles(action));
    }

    /**
     * 检查用户是否拥有指定角色之一
     *
     * 角色检查逻辑：
     *   1. 超级管理员 → 允许所有操作
     *   2. 租户主账号 → 允许管理级操作
     *   3. 其他用户   → 检查 roleName 关键字（admin/manager/director/管理）
     *   4. 无匹配     → 返回 false，进入 REQUIRES_APPROVAL 流程
     */
    private boolean userHasAnyRole(User user, String[] roles) {
        if (user == null || roles == null || roles.length == 0) {
            return false;
        }
        // 超级管理员拥有所有权限
        if (Boolean.TRUE.equals(user.getIsSuperAdmin())) {
            return true;
        }
        // 租户主账号拥有管理员权限
        if (Boolean.TRUE.equals(user.getIsTenantOwner())) {
            return true;
        }
        // 检查 roleName 是否包含管理权限关键字
        String roleName = user.getRoleName() != null ? user.getRoleName().toLowerCase() : "";
        if (roleName.contains("admin") || roleName.contains("manager")
                || roleName.contains("director") || roleName.contains("管理")) {
            return true;
        }
        log.debug("[PermissionDecision] 用户 {} (role={}) 不满足所需角色: {}",
            user.getId(), user.getRoleName(), String.join(",", roles));
        return false;
    }

    /**
     * 租户自动化配置
     */
    @lombok.Data
    @lombok.Builder
    public static class TenantAutoConfig {
        private Long tenantId;
        @lombok.Builder.Default
        private boolean autoExecutionEnabled = true;
        @lombok.Builder.Default
        private Integer autoExecutionThreshold = 2;  // 风险等级阈值
    }
}
