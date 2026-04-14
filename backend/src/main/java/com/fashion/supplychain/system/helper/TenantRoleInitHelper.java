package com.fashion.supplychain.system.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.*;
import com.fashion.supplychain.system.orchestration.PermissionCalculationEngine;
import com.fashion.supplychain.system.service.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 租户角色初始化助手：模板克隆、权限天花板、工人注册与审批
 * <p>从 TenantOrchestrator 拆分，事务由编排器层统一控制。</p>
 */
@Component
@Slf4j
public class TenantRoleInitHelper {

    @Autowired
    private RoleService roleService;

    @Autowired
    private RolePermissionService rolePermissionService;

    @Autowired
    private TenantPermissionCeilingService ceilingService;

    @Autowired
    private UserPermissionOverrideService overrideService;

    @Autowired
    private PermissionService permissionService;

    @Autowired
    private PermissionCalculationEngine permissionEngine;

    @Autowired
    private UserService userService;

    @Autowired
    private TenantService tenantService;

    @Autowired(required = false)
    private com.fashion.supplychain.websocket.service.WebSocketService webSocketService;

    @Autowired
    private FactoryWorkerService factoryWorkerService;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    private void assertSuperAdmin() {
        if (!UserContext.isSuperAdmin()) {
            throw new AccessDeniedException("仅超级管理员可执行此操作");
        }
    }

    private void assertSuperAdminOrTenantOwner() {
        if (UserContext.isSuperAdmin()) return;
        if (UserContext.isTenantOwner()) return;
        throw new AccessDeniedException("仅超级管理员或租户主账号可执行此操作");
    }

    private void assertSuperAdminOrTenantOwnerOrFactoryOwner() {
        if (UserContext.isSuperAdmin()) return;
        if (UserContext.isTenantOwner()) return;
        if (UserContext.isFactoryUser()) {
            User current = userService.getById(UserContext.userId());
            if (current != null && Boolean.TRUE.equals(current.getIsFactoryOwner())) return;
        }
        throw new AccessDeniedException("仅超级管理员、租户主账号或外发工厂管理员可执行此操作");
    }

    /**
     * 为新租户创建管理员角色（强制成功，失败抛异常回滚事务）
     *
     * 核心保障：新租户主账号必须拥有完整的管理员角色和权限
     * 流程：
     *   1. 查找 full_admin 全局模板角色
     *   2. 检查是否已存在（幂等性）
     *   3. 克隆角色 + 克隆权限
     *   4. 最终验证：确保角色和权限都已正确创建
     *
     * @throws IllegalStateException 模板不存在、克隆失败等情况，触发事务回滚
     */
    public Role createTenantAdminRole(Long tenantId, String tenantName, String tenantType) {
        // 1. 查找 full_admin 模板（全局唯一，is_template=true）
        LambdaQueryWrapper<Role> query = new LambdaQueryWrapper<>();
        query.eq(Role::getIsTemplate, true)
             .eq(Role::getRoleCode, "full_admin")
             .eq(Role::getStatus, "active")
             .last("LIMIT 1");
        Role template = roleService.getOne(query);

        if (template == null) {
            // ❌ 严重错误：模板角色是系统基础数据，缺失意味着系统初始化有问题
            log.error("[数据完整性-严重] 未找到 full_admin 角色模板 (is_template=true, role_code='full_admin', status='active')。" +
                      "请检查 t_role 表是否缺少模板角色数据！租户 {} 创建中止。", tenantId);
            throw new IllegalStateException(
                    "系统缺少角色模板 full_admin，无法创建租户。请联系管理员初始化角色模板数据。");
        }

        // 2. 幂等性检查：如果此租户已有 full_admin 角色，直接返回
        LambdaQueryWrapper<Role> dupCheck = new LambdaQueryWrapper<>();
        dupCheck.eq(Role::getTenantId, tenantId)
                .eq(Role::getRoleCode, template.getRoleCode());
        Role existingRole = roleService.getOne(dupCheck);
        if (existingRole != null) {
            log.info("租户 {} 已有管理员角色 (roleId={})，跳过创建", tenantId, existingRole.getId());
            return existingRole;
        }

        // 3. 克隆角色
        Role cloned = new Role();
        cloned.setRoleName(template.getRoleName());
        cloned.setRoleCode(template.getRoleCode());
        cloned.setDescription("租户" + tenantName + "的管理员角色（自动创建）");
        cloned.setStatus("active");
        cloned.setDataScope(template.getDataScope());
        cloned.setTenantId(tenantId);
        cloned.setIsTemplate(false);
        cloned.setSourceTemplateId(template.getId());
        cloned.setSortOrder(template.getSortOrder());
        cloned.setCreateTime(LocalDateTime.now());
        cloned.setUpdateTime(LocalDateTime.now());
        boolean roleSaved = roleService.save(cloned);
        if (!roleSaved || cloned.getId() == null) {
            throw new IllegalStateException(
                    "[数据完整性] 租户管理员角色保存失败，tenantId=" + tenantId);
        }

        // 4. 克隆权限关联
        List<Long> templatePermIds = rolePermissionService.getPermissionIdsByRoleId(template.getId());
        int permCount = 0;
        if (templatePermIds != null && !templatePermIds.isEmpty()) {
            // 天花板过滤：如果租户有天花板限制，仅克隆天花板内的权限
            List<Long> ceilingGranted = ceilingService.getGrantedPermissionIds(tenantId);
            List<Long> effectivePermIds;
            if (ceilingGranted != null && !ceilingGranted.isEmpty()) {
                Set<Long> ceilingSet = new HashSet<>(ceilingGranted);
                effectivePermIds = templatePermIds.stream()
                        .filter(ceilingSet::contains)
                        .collect(Collectors.toList());
            } else {
                // 无天花板限制 → 按租户类型过滤权限包，再继承剩余权限
                effectivePermIds = applyTenantTypePermissionFilter(templatePermIds, tenantType);
            }
            rolePermissionService.replaceRolePermissions(cloned.getId(), effectivePermIds);
            permCount = effectivePermIds.size();
        }

        // 5. 最终验证：确保权限正确持久化
        // ✅ roleSaved=true + cloned.getId() != null 已充分证明角色 INSERT 成功。
        //    旧版二次查询 getOne(eq(tenant_id=X)) 在超管路径下因 MyBatis-Plus
        //    fill 机制可能写入 null 而返回 null，导致误报失败，已移除。
        List<Long> verifiedPerms = rolePermissionService.getPermissionIdsByRoleId(cloned.getId());
        int verifiedPermCount = verifiedPerms != null ? verifiedPerms.size() : 0;
        if (permCount > 0 && verifiedPermCount == 0) {
            throw new IllegalStateException(
                    "[数据完整性] 角色权限克隆失败: 预期 " + permCount + " 个权限，实际 0 个");
        }

        log.info("[租户角色创建成功] tenantId={}, roleId={}, roleName={}, 权限数={}（模板权限数={}）",
                 tenantId, cloned.getId(), cloned.getRoleName(), verifiedPermCount,
                 templatePermIds != null ? templatePermIds.size() : 0);
        return cloned;
    }

    /**
     * 按租户类型过滤权限 ID 列表：去除该类型不需要的菜单权限。
     * <ul>
     *   <li>SELF_FACTORY：去除 MENU_FACTORY（无外发工厂管理）</li>
     *   <li>BRAND：去除 MENU_CUTTING（无自有裁剪产线）</li>
     *   <li>HYBRID / null / 其他：不过滤，继承全部</li>
     * </ul>
     */
    private List<Long> applyTenantTypePermissionFilter(List<Long> permIds, String tenantType) {
        if (tenantType == null || "HYBRID".equalsIgnoreCase(tenantType)) {
            return permIds;
        }
        Set<String> excludedCodes = new HashSet<>();
        if ("SELF_FACTORY".equalsIgnoreCase(tenantType)) {
            // 自建工厂：不开放外发工厂管理菜单
            excludedCodes.add("MENU_FACTORY");
        } else if ("BRAND".equalsIgnoreCase(tenantType)) {
            // 纯品牌：不开放裁剪管理菜单（无自有产线）
            excludedCodes.add("MENU_CUTTING");
        }
        if (excludedCodes.isEmpty()) return permIds;

        // 查询需要排除的权限 ID
        List<Permission> excludedPerms = permissionService.list(
                new QueryWrapper<Permission>().in("permission_code", excludedCodes));
        if (excludedPerms == null || excludedPerms.isEmpty()) return permIds;

        Set<Long> excludedIds = excludedPerms.stream()
                .map(Permission::getId)
                .collect(Collectors.toSet());
        List<Long> filtered = permIds.stream()
                .filter(id -> !excludedIds.contains(id))
                .collect(Collectors.toList());
        log.info("[租户类型权限过滤] type={}, 排除权限码={}, 排除ID数={}, 最终权限数={}",
                 tenantType, excludedCodes, excludedIds.size(), filtered.size());
        return filtered;
    }

    private User sanitizeUser(User user) {
        if (user != null) {
            user.setPassword(null);
        }
        return user;
    }

    /**
     * 获取所有可用的角色模板列表
     */
    public List<Role> listRoleTemplates() {
        LambdaQueryWrapper<Role> query = new LambdaQueryWrapper<>();
        query.eq(Role::getIsTemplate, true)
             .eq(Role::getStatus, "active")
             .orderByAsc(Role::getSortOrder);
        List<Role> templates = roleService.list(query);
        // 附加权限数量
        for (Role template : templates) {
            List<Long> permIds = rolePermissionService.getPermissionIdsByRoleId(template.getId());
            template.setPermissionCount(permIds != null ? permIds.size() : 0);
        }
        return templates;
    }

    /**
     * 将角色模板克隆到租户中
     * @param tenantId 目标租户ID
     * @param templateId 源模板ID
     * @return 克隆后的租户角色
     */
    public Role cloneRoleTemplate(Long tenantId, Long templateId) {
        assertSuperAdminOrTenantOwner();

        Role template = roleService.getById(templateId);
        if (template == null || !Boolean.TRUE.equals(template.getIsTemplate())) {
            throw new IllegalArgumentException("无效的角色模板ID: " + templateId);
        }

        // 检查是否已克隆（同一租户同一代码不重复）
        LambdaQueryWrapper<Role> dupCheck = new LambdaQueryWrapper<>();
        dupCheck.eq(Role::getTenantId, tenantId)
                .eq(Role::getRoleCode, template.getRoleCode());
        if (roleService.count(dupCheck) > 0) {
            throw new IllegalArgumentException("该角色模板已克隆到此租户: " + template.getRoleName());
        }

        // 克隆角色
        Role cloned = new Role();
        cloned.setRoleName(template.getRoleName());
        cloned.setRoleCode(template.getRoleCode());
        cloned.setDescription(template.getDescription());
        cloned.setStatus("active");
        cloned.setDataScope(template.getDataScope());
        cloned.setTenantId(tenantId);
        cloned.setIsTemplate(false);
        cloned.setSourceTemplateId(templateId);
        cloned.setSortOrder(template.getSortOrder());
        cloned.setCreateTime(LocalDateTime.now());
        cloned.setUpdateTime(LocalDateTime.now());
        roleService.save(cloned);

        // 克隆权限关联
        List<Long> templatePermIds = rolePermissionService.getPermissionIdsByRoleId(templateId);
        if (templatePermIds != null && !templatePermIds.isEmpty()) {
            // 天花板过滤：如果租户有天花板，仅克隆天花板内的权限
            List<Long> ceilingGranted = ceilingService.getGrantedPermissionIds(tenantId);
            List<Long> effectivePermIds;
            if (ceilingGranted != null && !ceilingGranted.isEmpty()) {
                Set<Long> ceilingSet = new HashSet<>(ceilingGranted);
                effectivePermIds = templatePermIds.stream()
                        .filter(ceilingSet::contains)
                        .collect(Collectors.toList());
            } else {
                effectivePermIds = templatePermIds;
            }
            rolePermissionService.replaceRolePermissions(cloned.getId(), effectivePermIds);
        }

        log.info("角色模板克隆完成: template={} -> tenantRole={}, tenantId={}", templateId, cloned.getId(), tenantId);
        return cloned;
    }

    /**
     * 获取租户的角色列表（已克隆的角色）
     */
    public List<Role> listTenantRoles(Long tenantId) {
        assertSuperAdminOrTenantOwner();
        Long tid = tenantId != null ? tenantId : UserContext.tenantId();
        if (tid == null) {
            throw new IllegalArgumentException("租户ID不能为空");
        }

        LambdaQueryWrapper<Role> query = new LambdaQueryWrapper<>();
        query.eq(Role::getTenantId, tid)
             .eq(Role::getIsTemplate, false)
             .eq(Role::getStatus, "active")
             .orderByAsc(Role::getSortOrder);
        List<Role> roles = roleService.list(query);
        for (Role role : roles) {
            List<Long> permIds = rolePermissionService.getPermissionIdsByRoleId(role.getId());
            role.setPermissionCount(permIds != null ? permIds.size() : 0);
        }
        return roles;
    }

    /**
     * 更新租户角色的权限（在天花板范围内微调）
     */
    public void updateTenantRolePermissions(Long roleId, List<Long> permissionIds) {
        assertSuperAdminOrTenantOwner();

        Role role = roleService.getById(roleId);
        if (role == null) {
            throw new IllegalArgumentException("角色不存在");
        }
        if (Boolean.TRUE.equals(role.getIsTemplate())) {
            throw new IllegalArgumentException("不能修改角色模板的权限，请修改克隆后的租户角色");
        }

        Long tenantId = role.getTenantId();
        // 天花板校验
        if (tenantId != null && permissionIds != null) {
            List<Long> ceilingGranted = ceilingService.getGrantedPermissionIds(tenantId);
            if (ceilingGranted != null && !ceilingGranted.isEmpty()) {
                Set<Long> ceilingSet = new HashSet<>(ceilingGranted);
                List<Long> exceeding = permissionIds.stream()
                        .filter(id -> !ceilingSet.contains(id))
                        .collect(Collectors.toList());
                if (!exceeding.isEmpty()) {
                    throw new IllegalArgumentException("以下权限不在租户天花板范围内: " + exceeding);
                }
            }
        }

        rolePermissionService.replaceRolePermissions(roleId, permissionIds);
        permissionEngine.evictRolePermissionCache(roleId);
        log.info("租户角色权限更新: roleId={}, permCount={}", roleId, permissionIds != null ? permissionIds.size() : 0);
    }

    /**
     * 获取租户权限天花板（可用权限ID列表）
     */
    public Map<String, Object> getTenantCeiling(Long tenantId) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) {
            throw new IllegalArgumentException("租户不存在");
        }

        List<Long> grantedIds = ceilingService.getGrantedPermissionIds(tenantId);
        List<Permission> allPerms = permissionService.list();

        Map<String, Object> result = new HashMap<>();
        result.put("tenantId", tenantId);
        result.put("tenantName", tenant.getTenantName());
        result.put("grantedPermissionIds", grantedIds);
        result.put("allPermissions", allPerms);
        result.put("hasCeiling", grantedIds != null && !grantedIds.isEmpty());
        return result;
    }

    public Page<User> listFactoryPendingRegistrations(Long page, Long pageSize) {
        assertSuperAdminOrTenantOwnerOrFactoryOwner();

        LambdaQueryWrapper<User> query = new LambdaQueryWrapper<>();
        query.eq(User::getRegistrationStatus, "PENDING");

        Long tenantId = UserContext.tenantId();
        if (tenantId != null) {
            query.eq(User::getTenantId, tenantId);
        }
        query.isNotNull(User::getFactoryId).ne(User::getFactoryId, "");

        String currentFactoryId = UserContext.factoryId();
        if (currentFactoryId != null) {
            User current = userService.getById(UserContext.userId());
            if (current != null && Boolean.TRUE.equals(current.getIsFactoryOwner())) {
                query.eq(User::getFactoryId, currentFactoryId);
            }
        }

        query.orderByDesc(User::getCreateTime);

        Page<User> result = userService.page(
                new Page<>(page != null ? page : 1, pageSize != null ? pageSize : 20), query);
        if (result.getRecords() != null) {
            result.setRecords(result.getRecords().stream().map(user -> {
                User sanitized = sanitizeUser(user);
                if (sanitized.getTenantId() != null) {
                    Tenant tenant = tenantService.getById(sanitized.getTenantId());
                    if (tenant != null) {
                        sanitized.setTenantName(tenant.getTenantName());
                    }
                }
                return sanitized;
            }).collect(Collectors.toList()));
        }
        return result;
    }

    /**
     * 设置租户权限天花板
     * @param tenantId 租户ID
     * @param grantedPermissionIds 允许的权限ID列表（传空数组=不限制）
     */
    public void setTenantCeiling(Long tenantId, List<Long> grantedPermissionIds) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) {
            throw new IllegalArgumentException("租户不存在");
        }

        ceilingService.replaceCeiling(tenantId, grantedPermissionIds);
        permissionEngine.evictTenantCeilingCache(tenantId);
        log.info("租户权限天花板设置完成: tenantId={}, permCount={}", tenantId,
                grantedPermissionIds != null ? grantedPermissionIds.size() : 0);
    }

    /**
     * 工人通过小程序注册（无需登录）
     */
    public Map<String, Object> workerRegister(String username, String password, String name,
                                                String phone, String tenantCode, String factoryId, String orgUnitId) {
        // 验证租户码（统一错误消息防止枚举）
        Tenant tenant = tenantService.findByTenantCode(tenantCode);
        if (tenant == null || !"active".equals(tenant.getStatus())) {
            throw new IllegalArgumentException("注册失败，请检查租户编码是否正确");
        }

        // 验证用户名唯一
        QueryWrapper<User> userQuery = new QueryWrapper<>();
        userQuery.eq("username", username);
        if (userService.count(userQuery) > 0) {
            throw new IllegalArgumentException("用户名已存在: " + username);
        }

        // 查找租户的 "工人" 角色
        LambdaQueryWrapper<Role> roleQuery = new LambdaQueryWrapper<>();
        roleQuery.eq(Role::getTenantId, tenant.getId())
                 .eq(Role::getRoleCode, "worker")
                 .eq(Role::getStatus, "active")
                 .last("LIMIT 1");
        Role workerRole = roleService.getOne(roleQuery);

        // 创建待审批用户
        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(password));
        user.setName(name);
        user.setPhone(phone);
        user.setTenantId(tenant.getId());
        user.setIsTenantOwner(false);
        user.setStatus("inactive"); // 注册中，未激活
        user.setRegistrationStatus("PENDING");
        user.setRegistrationTenantCode(tenantCode);
        if (workerRole != null) {
            user.setRoleId(workerRole.getId());
            user.setRoleName(workerRole.getRoleName());
        }
        user.setPermissionRange("self");
        if (org.springframework.util.StringUtils.hasText(factoryId)) {
            user.setFactoryId(factoryId);
        }
        if (org.springframework.util.StringUtils.hasText(orgUnitId)) {
            user.setOrgUnitId(orgUnitId);
        }
        user.setCreateTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());
        userService.save(user);

        if (org.springframework.util.StringUtils.hasText(factoryId)) {
            try {
                FactoryWorker fw = new FactoryWorker();
                fw.setFactoryId(factoryId);
                fw.setTenantId(tenant.getId());
                fw.setWorkerName(name);
                fw.setPhone(phone);
                fw.setStatus("active");
                fw.setDeleteFlag(0);
                fw.setCreateTime(LocalDateTime.now());
                fw.setUpdateTime(LocalDateTime.now());
                factoryWorkerService.save(fw);
                log.info("[工人注册] 已自动收录到工厂名册: factoryId={}, workerName={}", factoryId, name);
            } catch (Exception e) {
                log.warn("[工人注册] 自动收录工厂名册失败(不影响注册): {}", e.getMessage());
            }
        }

        // 通知租户内管理主管以上用户（主账号 + admin/manager/supervisor角色），不含超管
        try {
            if (webSocketService != null) {
                // 查找租户内的管理类角色 ID
                LambdaQueryWrapper<Role> mgmtRolesQuery = new LambdaQueryWrapper<>();
                mgmtRolesQuery.eq(Role::getTenantId, tenant.getId())
                              .in(Role::getRoleCode, Arrays.asList(
                                  "admin", "manager", "supervisor",
                                  "tenant_admin", "tenant_manager"))
                              .eq(Role::getStatus, "active");
                List<Role> mgmtRoles = roleService.list(mgmtRolesQuery);
                List<Long> mgmtRoleIds = mgmtRoles.stream()
                        .map(Role::getId).collect(Collectors.toList());

                // 查找需要通知的用户：主账号 或 管理角色，状态active
                LambdaQueryWrapper<User> notifyQuery = new LambdaQueryWrapper<>();
                notifyQuery.eq(User::getTenantId, tenant.getId())
                           .eq(User::getStatus, "active")
                           .and(w -> {
                               w.eq(User::getIsTenantOwner, true);
                               if (!mgmtRoleIds.isEmpty()) {
                                   w.or().in(User::getRoleId, mgmtRoleIds);
                               }
                           });
                List<User> managers = userService.list(notifyQuery);

                String workerDisplay = name != null ? name : username;
                for (User mgr : managers) {
                    webSocketService.notifyWorkerRegistrationPending(
                        String.valueOf(mgr.getId()),
                        workerDisplay
                    );
                }
                log.info("[注册通知] 已推送给 {} 位租户管理人员, tenantId={}", managers.size(), tenant.getId());
            }
        } catch (Exception e) {
            log.warn("通知租户管理人员WebSocket失败，不影响注册流程: {}", e.getMessage());
        }

        Map<String, Object> result = new HashMap<>();
        result.put("userId", user.getId());
        result.put("status", "PENDING");
        result.put("message", "注册申请已提交，请等待管理员审批");
        return result;
    }

    /**
     * 获取待审批的注册用户列表（租户主账号查看）
     */
    public Page<User> listPendingRegistrations(Long page, Long pageSize) {
        assertSuperAdminOrTenantOwnerOrFactoryOwner();

        LambdaQueryWrapper<User> query = new LambdaQueryWrapper<>();
        query.eq(User::getRegistrationStatus, "PENDING");

        Long tenantId = UserContext.tenantId();
        if (tenantId != null) {
            query.eq(User::getTenantId, tenantId);
        }

        String currentFactoryId = UserContext.factoryId();
        if (currentFactoryId != null) {
            User current = userService.getById(UserContext.userId());
            if (current != null && Boolean.TRUE.equals(current.getIsFactoryOwner())) {
                query.eq(User::getFactoryId, currentFactoryId);
            } else {
                query.isNull(User::getFactoryId);
            }
        }

        query.orderByDesc(User::getCreateTime);

        Page<User> result = userService.page(
                new Page<>(page != null ? page : 1, pageSize != null ? pageSize : 20), query);
        if (result.getRecords() != null) {
            result.setRecords(result.getRecords().stream().map(user -> {
                User sanitized = sanitizeUser(user);
                if (sanitized.getTenantId() != null) {
                    Tenant tenant = tenantService.getById(sanitized.getTenantId());
                    if (tenant != null) {
                        sanitized.setTenantName(tenant.getTenantName());
                    }
                }
                return sanitized;
            }).collect(Collectors.toList()));
        }
        return result;
    }

    /**
     * 审批通过注册用户
     */
    public boolean approveRegistration(Long userId, Long roleId) {
        assertSuperAdminOrTenantOwnerOrFactoryOwner();

        User user = userService.getById(userId);
        if (user == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        if (!"PENDING".equals(user.getRegistrationStatus())) {
            throw new IllegalArgumentException("该用户不在待审批状态");
        }

        Long tenantId = UserContext.tenantId();
        if (tenantId != null && !tenantId.equals(user.getTenantId())) {
            throw new AccessDeniedException("无权审批其他租户的注册申请");
        }

        String currentFactoryId = UserContext.factoryId();
        boolean isFactoryOwner = false;
        if (currentFactoryId != null) {
            User current = userService.getById(UserContext.userId());
            isFactoryOwner = current != null && Boolean.TRUE.equals(current.getIsFactoryOwner());
        }

        if (isFactoryOwner) {
            if (!currentFactoryId.equals(user.getFactoryId())) {
                throw new AccessDeniedException("外发工厂管理员只能审批本工厂的注册申请");
            }
        }

        if (roleId != null) {
            Role role = roleService.getById(roleId);
            if (role != null) {
                user.setRoleId(role.getId());
                user.setRoleName(role.getRoleName());
            }
        }

        user.setRegistrationStatus("ACTIVE");
        user.setStatus("active");
        user.setApprovalStatus("approved");
        user.setApprovalTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());

        boolean success = userService.updateById(user);
        if (success) {
            log.info("注册审批通过: userId={}, username={}", userId, user.getUsername());
        }
        return success;
    }

    /**
     * 拒绝注册用户
     */
    public boolean rejectRegistration(Long userId, String reason) {
        assertSuperAdminOrTenantOwnerOrFactoryOwner();

        User user = userService.getById(userId);
        if (user == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        if (!"PENDING".equals(user.getRegistrationStatus())) {
            throw new IllegalArgumentException("该用户不在待审批状态");
        }

        Long tenantId = UserContext.tenantId();
        if (tenantId != null && !tenantId.equals(user.getTenantId())) {
            throw new AccessDeniedException("无权拒绝其他租户的注册申请");
        }

        String currentFactoryId = UserContext.factoryId();
        boolean isFactoryOwner = false;
        if (currentFactoryId != null) {
            User current = userService.getById(UserContext.userId());
            isFactoryOwner = current != null && Boolean.TRUE.equals(current.getIsFactoryOwner());
        }

        if (isFactoryOwner) {
            if (!currentFactoryId.equals(user.getFactoryId())) {
                throw new AccessDeniedException("外发工厂管理员只能拒绝本工厂的注册申请");
            }
        } else if (UserContext.isTenantOwner()) {
            if (user.getFactoryId() != null && !user.getFactoryId().isEmpty()) {
                throw new AccessDeniedException("外发工厂的员工由外发工厂管理员审批，租户不可操作");
            }
        }

        user.setRegistrationStatus("REJECTED");
        user.setRejectReason(reason);
        user.setStatus("inactive");
        user.setApprovalStatus("rejected");
        user.setApprovalTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());

        boolean success = userService.updateById(user);
        if (success) {
            log.info("注册申请拒绝: userId={}, username={}, reason={}", userId, user.getUsername(), reason);
        }
        return success;
    }

    /**
     * 获取用户权限覆盖配置
     */
    public Map<String, Object> getUserPermissionOverrides(Long userId) {
        assertSuperAdminOrTenantOwner();

        User user = userService.getById(userId);
        if (user == null) {
            throw new IllegalArgumentException("用户不存在");
        }

        // 租户隔离检查
        Long tenantId = UserContext.tenantId();
        if (tenantId != null && !tenantId.equals(user.getTenantId())) {
            throw new AccessDeniedException("无权操作其他租户的用户");
        }

        List<Long> grantIds = overrideService.getGrantPermissionIds(userId);
        List<Long> revokeIds = overrideService.getRevokePermissionIds(userId);

        Map<String, Object> result = new HashMap<>();
        result.put("userId", userId);
        result.put("grantPermissionIds", grantIds);
        result.put("revokePermissionIds", revokeIds);
        return result;
    }

    /**
     * 设置用户权限覆盖
     */
    public void setUserPermissionOverrides(Long userId, List<Long> grantIds, List<Long> revokeIds) {
        assertSuperAdminOrTenantOwner();

        User user = userService.getById(userId);
        if (user == null) {
            throw new IllegalArgumentException("用户不存在");
        }

        Long tenantId = UserContext.tenantId();
        if (tenantId != null && !tenantId.equals(user.getTenantId())) {
            throw new AccessDeniedException("无权操作其他租户的用户");
        }

        overrideService.replaceOverrides(userId, user.getTenantId(), grantIds, revokeIds);
        permissionEngine.evictUserPermissionCache(userId);
        log.info("用户权限覆盖设置完成: userId={}, grants={}, revokes={}",
                userId, grantIds != null ? grantIds.size() : 0, revokeIds != null ? revokeIds.size() : 0);
    }

    /**
     * 初始化新租户的完整职位角色体系：自动将所有 is_template=true 的职位模板克隆到租户。
     * <p>
     * 职位模板在 t_role 表中以 is_template=1, tenant_id=NULL 存储，模板的权限可由
     * 超管在「系统设置→角色模板」中调整，租户管理员拿到克隆副本后也可在「角色管理」中
     * 二次调整，所有权限逻辑来自数据库，不含任何硬编码权限列表。
     * </p>
     * <p>
     * 新员工添加时只需选择对应职位，权限即刻生效，无需逐人配置。
     * </p>
     *
     * @param tenantId   目标租户ID
     * @param tenantName 租户名称（用于描述字段）
     * @param tenantType 租户类型（影响天花板过滤，如 SELF_FACTORY/BRAND/HYBRID）
     * @return 租户全能管理员角色（full_admin 克隆），供主账号绑定时使用
     */
    public Role initializeAllTenantRoles(Long tenantId, String tenantName, String tenantType) {
        // Step 1: 必须先克隆 full_admin（主账号绑定角色）
        Role adminRole = createTenantAdminRole(tenantId, tenantName, tenantType);

        // Step 2: 查出所有其余活跃职位模板，逐一克隆到租户
        LambdaQueryWrapper<Role> q = new LambdaQueryWrapper<>();
        q.eq(Role::getIsTemplate, true)
         .eq(Role::getStatus, "active")
         .ne(Role::getRoleCode, "full_admin")  // full_admin 已在 Step 1 处理
         .orderByAsc(Role::getSortOrder);
        List<Role> otherTemplates = roleService.list(q);

        for (Role tmpl : otherTemplates) {
            try {
                // 幂等：同租户已有同 role_code 则跳过
                LambdaQueryWrapper<Role> dup = new LambdaQueryWrapper<>();
                dup.eq(Role::getTenantId, tenantId).eq(Role::getRoleCode, tmpl.getRoleCode());
                if (roleService.count(dup) > 0) {
                    log.debug("[职位初始化] 租户 {} 已有角色 {}，跳过", tenantId, tmpl.getRoleCode());
                    continue;
                }

                // 克隆角色行
                Role cloned = new Role();
                cloned.setRoleName(tmpl.getRoleName());
                cloned.setRoleCode(tmpl.getRoleCode());
                cloned.setDescription(tmpl.getDescription());
                cloned.setStatus("active");
                cloned.setDataScope(tmpl.getDataScope());
                cloned.setTenantId(tenantId);
                cloned.setIsTemplate(false);
                cloned.setSourceTemplateId(tmpl.getId());
                cloned.setSortOrder(tmpl.getSortOrder());
                cloned.setCreateTime(LocalDateTime.now());
                cloned.setUpdateTime(LocalDateTime.now());
                roleService.save(cloned);

                // 克隆权限（含天花板过滤 + 租户类型过滤，与 createTenantAdminRole 逻辑对齐）
                List<Long> tmplPermIds = rolePermissionService.getPermissionIdsByRoleId(tmpl.getId());
                if (tmplPermIds != null && !tmplPermIds.isEmpty()) {
                    List<Long> ceilingGranted = ceilingService.getGrantedPermissionIds(tenantId);
                    List<Long> effectiveIds;
                    if (ceilingGranted != null && !ceilingGranted.isEmpty()) {
                        Set<Long> ceilingSet = new HashSet<>(ceilingGranted);
                        effectiveIds = tmplPermIds.stream().filter(ceilingSet::contains).collect(Collectors.toList());
                    } else {
                        effectiveIds = applyTenantTypePermissionFilter(tmplPermIds, tenantType);
                    }
                    rolePermissionService.replaceRolePermissions(cloned.getId(), effectiveIds);
                }
                log.info("[职位初始化] 克隆完成 tenantId={} 职位={}({})",
                         tenantId, tmpl.getRoleName(), tmpl.getRoleCode());
            } catch (Exception e) {
                // 非 full_admin 克隆失败不阻断主流程，仅记录警告（租户管理员之后可手动克隆）
                log.warn("[职位初始化] 克隆失败（非阻断）tenantId={} role={} err={}",
                         tenantId, tmpl.getRoleCode(), e.getMessage());
            }
        }
        log.info("[职位初始化] 完成 tenantId={} 已初始化角色数={}", tenantId, otherTemplates.size() + 1);
        return adminRole;
    }

}
