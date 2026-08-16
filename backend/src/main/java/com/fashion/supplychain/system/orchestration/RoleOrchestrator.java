package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.system.entity.Permission;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.entity.RoleTemplate;
import com.fashion.supplychain.system.service.PermissionService;
import com.fashion.supplychain.system.service.RolePermissionService;
import com.fashion.supplychain.system.service.RoleService;
import com.fashion.supplychain.system.service.RoleTemplateService;
import com.fashion.supplychain.system.service.LoginLogService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.stream.Collectors;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class RoleOrchestrator {

    @Autowired
    private RoleService roleService;

    @Autowired
    private RolePermissionService rolePermissionService;

    @Autowired
    private LoginLogService loginLogService;

    @Autowired
    private PermissionCalculationEngine permissionEngine;

    @Autowired
    private RoleTemplateService roleTemplateService;

    @Autowired
    private PermissionService permissionService;

    @Autowired
    private ObjectMapper objectMapper;

    public Page<Role> list(Long page, Long pageSize, String roleName, String roleCode, String status) {
        return roleService.getRolePage(page, pageSize, roleName, roleCode, status);
    }

    public List<Role> listAll() {
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Role> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Role>()
                        .eq(Role::getStatus, "active")
                        .orderByAsc(Role::getSortOrder)
                        .orderByAsc(Role::getCreateTime);
        Long tenantId = UserContext.tenantId();
        if (tenantId != null) {
            wrapper.eq(Role::getTenantId, tenantId);
        }
        return roleService.list(wrapper);
    }

    public Role getById(Long id) {
        Role role = roleService.getById(id);
        if (role == null) {
            throw new NoSuchElementException("角色不存在");
        }
        return role;
    }

    /**
     * 保留角色名/代码守卫：自建/改名角色撞上系统管理员名称会被
     * UserContext.isTopAdmin 精确白名单识别为顶级管理员（越权），从创建入口拦截
     */
    private static final Set<String> RESERVED_ROLE_CODES = Set.of("admin", "full_admin");
    private static final Set<String> RESERVED_ROLE_NAMES = Set.of(
            "管理员", "系统管理员", "超级管理员", "租户管理员", "老板", "全能管理",
            "admin", "administrator", "owner", "tenant_owner");

    private void assertNotReservedRole(String roleName, String roleCode) {
        if (StringUtils.hasText(roleName) && RESERVED_ROLE_NAMES.contains(roleName.trim())) {
            throw new IllegalArgumentException("角色名称【" + roleName.trim() + "】与系统内置管理员角色冲突，请更换名称");
        }
        if (StringUtils.hasText(roleCode) && RESERVED_ROLE_CODES.contains(roleCode.trim().toLowerCase())) {
            throw new IllegalArgumentException("角色代码【" + roleCode.trim() + "】为系统保留，请更换");
        }
    }

    public boolean add(Role role) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        assertNotReservedRole(role == null ? null : role.getRoleName(), role == null ? null : role.getRoleCode());
        boolean success = roleService.save(role);
        if (!success) {
            throw new IllegalStateException("新增失败");
        }
        String roleName = role != null ? role.getRoleName() : null;
        saveOperationLog("role", role == null ? null : String.valueOf(role.getId()), roleName, "CREATE", null);
        return true;
    }

    public boolean update(Role role) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        String remark = role == null ? null : TextUtils.safeText(role.getOperationRemark());
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        // 改名同样禁止撞保留名（只校验本次提交的名称/代码，不拦历史数据）
        assertNotReservedRole(role == null ? null : role.getRoleName(), role == null ? null : role.getRoleCode());
        String roleName = role != null ? role.getRoleName() : null;
        boolean success = roleService.updateById(role);
        if (!success) {
            throw new IllegalStateException("更新失败");
        }
        saveOperationLog("role", role == null ? null : String.valueOf(role.getId()), roleName, "UPDATE", remark);
        return true;
    }

    public boolean delete(Long id) {
        return delete(id, null);
    }

    public boolean delete(Long id, String remark) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        String normalized = TextUtils.safeText(remark);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        // 删除前取快照，确保操作日志能记录角色名称
        Role snapshot = roleService.getById(id);
        String roleName = snapshot != null ? snapshot.getRoleName() : null;
        boolean success = roleService.removeById(id);
        if (!success) {
            if (snapshot == null) {
                log.warn("[ROLE-DELETE] id={} already deleted, idempotent success", id);
                return true;
            }
            throw new IllegalStateException("删除失败");
        }
        saveOperationLog("role", id == null ? null : String.valueOf(id), roleName, "DELETE", normalized);
        return true;
    }

    public List<Long> permissionIds(Long id) {
        if (id == null) {
            throw new IllegalArgumentException("角色ID不能为空");
        }
        return rolePermissionService.getPermissionIdsByRoleId(id);
    }

    public boolean updatePermissionIds(Long id, List<Long> permissionIds, String remark) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        if (id == null) {
            throw new IllegalArgumentException("角色ID不能为空");
        }
        String normalized = TextUtils.safeText(remark);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        Role role = roleService.getById(id);
        String roleName = role != null ? role.getRoleName() : null;
        boolean success = rolePermissionService.replaceRolePermissions(id, permissionIds);
        if (!success) {
            throw new IllegalStateException("保存失败");
        }
        saveOperationLog("role", String.valueOf(id), roleName, "PERMISSION_UPDATE", normalized);
        // Bug1修复: 驱逐角色权限缓存及所有用户权限缓存，确保变更立即生效，无需等待30分钟TTL
        try {
            permissionEngine.evictRolePermissionCache(id);
            permissionEngine.evictAllUserPermissionCaches();
            log.info("[RoleOrchestrator] 角色{}权限已更新，缓存已清除", id);
        } catch (Exception e) {
            log.warn("[RoleOrchestrator] 清除权限缓存失败，将在TTL后自动生效: {}", e.getMessage());
        }
        return true;
    }

    /**
     * 根据模板创建角色
     * @param templateId 模板ID
     * @param roleName 自定义的角色名称（可选，为空则用模板名称）
     * @param remark 操作原因
     * @return 创建的角色ID
     */
    public Long applyTemplate(Long templateId, String roleName, String remark) {
        // 1. 获取模板
        RoleTemplate template = roleTemplateService.getById(templateId);
        if (template == null || template.getDeleteFlag() == 1) {
            throw new NoSuchElementException("模板不存在");
        }
        // 自定义角色名禁止撞系统管理员保留名（防自建"管理员"角色被判定为顶级管理员）
        assertNotReservedRole(StringUtils.hasText(roleName) ? roleName : template.getTemplateName(), null);

        // 2. 创建角色
        Role role = new Role();
        role.setRoleName(StringUtils.hasText(roleName) ? roleName : template.getTemplateName());
        role.setDescription(template.getTemplateDesc());
        role.setStatus("active");
        role.setDataScope(template.getPermissionRange());
        role.setIsTemplate(false);
        role.setSourceTemplateId(templateId);
        role.setTenantId(UserContext.tenantId());

        boolean saved = roleService.save(role);
        if (!saved) {
            throw new IllegalStateException("创建角色失败");
        }

        Long roleId = role.getId();

        // 3. 将权限码转换为权限ID，并设置角色权限
        if (StringUtils.hasText(template.getPermissionsJson())) {
            try {
                List<String> permissionCodes = objectMapper.readValue(
                    template.getPermissionsJson(), new TypeReference<List<String>>() {});
                if (permissionCodes != null && !permissionCodes.isEmpty()) {
                    // 根据权限码查询权限ID
                    List<Long> permissionIds = permissionService.list(
                        new LambdaQueryWrapper<Permission>()
                            .in(Permission::getPermissionCode, permissionCodes)
                    ).stream().map(Permission::getId).collect(Collectors.toList());

                    if (!permissionIds.isEmpty()) {
                        rolePermissionService.replaceRolePermissions(roleId, permissionIds);
                    }
                }
            } catch (Exception e) {
                log.warn("解析权限JSON失败: {}", e.getMessage());
            }
        }

        // 4. 记录操作日志
        saveOperationLog("role", String.valueOf(roleId), role.getRoleName(), "CREATE_FROM_TEMPLATE",
            StringUtils.hasText(remark) ? remark : "从模板【" + template.getTemplateName() + "】创建");

        // 5. 清除缓存
        try {
            permissionEngine.evictRolePermissionCache(roleId);
            permissionEngine.evictAllUserPermissionCaches();
        } catch (Exception e) {
            log.warn("清除权限缓存失败: {}", e.getMessage());
        }

        return roleId;
    }

    // 使用TextUtils.safeText()替代

    private void saveOperationLog(String bizType, String bizId, String targetName, String action, String remark) {
        try {
            UserContext ctx = UserContext.get();
            String operator = (ctx != null ? ctx.getUsername() : null);
            loginLogService.recordOperation(bizType, bizId, targetName, action, operator, remark);
        } catch (Exception e) {
            log.warn("[RoleOrch] 记录操作日志失败: {}", e.getMessage());
        }
    }
}