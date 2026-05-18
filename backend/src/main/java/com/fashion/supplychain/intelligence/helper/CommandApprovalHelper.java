package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.service.RoleService;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 命令审批辅助 — 从 IntelligenceExecutionController 提取审批角色映射逻辑
 *
 * 使用场景：
 *   - 判断某个操作需要哪些角色审批
 *   - 从租户角色中筛选有权限的审批人
 */
@Component
@Slf4j
public class CommandApprovalHelper {

    @Autowired(required = false)
    private RoleService roleService;

    /**
     * 根据操作 action 获取所需审批角色名
     */
    public String getApprovalRoleForAction(String action) {
        if (action == null) return null;
        return switch (action.toLowerCase()) {
            case "transfer_factory", "factory_transfer" -> "工厂管理员";
            case "close_order" -> "生产主管";
            case "adjust_price", "recalculate_wage" -> "财务主管";
            case "delete_order", "force_delete" -> "系统管理员";
            case "approve_payroll" -> "财务审批员";
            case "export_sensitive_data" -> "数据管理员";
            default -> null;
        };
    }

    /**
     * 获取租户中能审批指定 action 的角色名列表
     */
    public List<String> getApprovalRolesForAction(String action) {
        String requiredRole = getApprovalRoleForAction(action);
        if (requiredRole == null) return List.of();
        if (roleService == null) return List.of(requiredRole);
        try {
            Long tenantId = UserContext.tenantId();
            List<Role> roles = roleService.lambdaQuery()
                    .eq(Role::getTenantId, tenantId)
                    .like(Role::getRoleName, requiredRole)
                    .select(Role::getRoleName)
                    .list();
            if (roles.isEmpty()) return List.of(requiredRole);
            return roles.stream().map(Role::getRoleName).filter(StringUtils::hasText).distinct().toList();
        } catch (Exception e) {
            log.warn("[CommandApprovalHelper] 查询审批角色失败 action={}: {}", action, e.getMessage());
            return List.of(requiredRole);
        }
    }
}