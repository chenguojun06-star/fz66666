package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.*;
import com.fashion.supplychain.system.service.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 租户管理编排器
 *
 * 核心职责：
 * 1. 创建租户（超级管理员操作）
 * 2. 租户主账号管理子账号（同租户内CRUD）
 * 3. 租户信息查询和更新
 *
 * 权限层级：
 * - 超级管理员（tenantId=null）：管理所有租户，创建/禁用/删除租户
 * - 租户主账号（isTenantOwner=true）：管理本租户内的子账号
 * - 子账号：无管理权限，只能操作自己的业务数据
 */
@Service
@Slf4j
public class TenantOrchestrator {

    @Autowired
    private TenantService tenantService;

    @Autowired
    private UserService userService;

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

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    // ========== 超级管理员操作 ==========

    /**
     * 创建新租户（超级管理员专用）
     * 同时创建租户主账号
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createTenant(String tenantName, String tenantCode,
                                             String contactName, String contactPhone,
                                             String ownerUsername, String ownerPassword,
                                             String ownerName, Integer maxUsers) {
        assertSuperAdmin();

        // 验证租户编码唯一
        if (tenantService.findByTenantCode(tenantCode) != null) {
            throw new IllegalArgumentException("租户编码已存在: " + tenantCode);
        }

        // 验证用户名唯一
        QueryWrapper<User> userQuery = new QueryWrapper<>();
        userQuery.eq("username", ownerUsername);
        if (userService.count(userQuery) > 0) {
            throw new IllegalArgumentException("用户名已存在: " + ownerUsername);
        }

        // 1. 创建租户记录
        Tenant tenant = new Tenant();
        tenant.setTenantName(tenantName);
        tenant.setTenantCode(tenantCode);
        tenant.setContactName(contactName);
        tenant.setContactPhone(contactPhone);
        tenant.setStatus("active");
        tenant.setMaxUsers(maxUsers != null ? maxUsers : 50);
        tenant.setCreateTime(LocalDateTime.now());
        tenant.setUpdateTime(LocalDateTime.now());
        tenantService.save(tenant);

        // 2. 创建租户主账号
        User owner = new User();
        owner.setUsername(ownerUsername);
        owner.setPassword(passwordEncoder.encode(ownerPassword));
        owner.setName(StringUtils.hasText(ownerName) ? ownerName : contactName);
        owner.setTenantId(tenant.getId());
        owner.setIsTenantOwner(true);
        // 主账号默认为管理员角色
        Role adminRole = findAdminRole();
        if (adminRole != null) {
            owner.setRoleId(adminRole.getId());
            owner.setRoleName(adminRole.getRoleName());
        }
        owner.setPermissionRange("all");
        owner.setStatus("active");
        owner.setApprovalStatus("approved");
        owner.setCreateTime(LocalDateTime.now());
        owner.setUpdateTime(LocalDateTime.now());
        userService.save(owner);

        // 3. 回填租户的 ownerUserId
        tenant.setOwnerUserId(owner.getId());
        tenantService.updateById(tenant);

        Map<String, Object> result = new HashMap<>();
        result.put("tenant", tenant);
        result.put("owner", sanitizeUser(owner));
        return result;
    }

    /**
     * 查询所有租户列表（超级管理员专用）
     */
    public Page<Tenant> listTenants(Long page, Long pageSize, String tenantName, String status) {
        assertSuperAdmin();
        QueryWrapper<Tenant> query = new QueryWrapper<>();
        if (StringUtils.hasText(tenantName)) {
            query.like("tenant_name", tenantName);
        }
        if (StringUtils.hasText(status)) {
            query.eq("status", status);
        }
        query.orderByDesc("create_time");
        return tenantService.page(new Page<>(page != null ? page : 1, pageSize != null ? pageSize : 20), query);
    }

    /**
     * 更新租户信息（超级管理员专用）
     */
    public boolean updateTenant(Tenant tenant) {
        assertSuperAdmin();
        if (tenant == null || tenant.getId() == null) {
            throw new IllegalArgumentException("租户ID不能为空");
        }
        tenant.setUpdateTime(LocalDateTime.now());
        return tenantService.updateById(tenant);
    }

    /**
     * 禁用/启用租户（超级管理员专用）
     */
    public boolean toggleTenantStatus(Long tenantId, String status) {
        assertSuperAdmin();
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) {
            throw new IllegalArgumentException("租户不存在");
        }
        tenant.setStatus(status);
        tenant.setUpdateTime(LocalDateTime.now());
        return tenantService.updateById(tenant);
    }

    // ========== 租户主账号操作 ==========

    /**
     * 租户主账号添加子账号
     */
    @Transactional(rollbackFor = Exception.class)
    public User addSubAccount(User userData) {
        assertTenantOwner();

        Long tenantId = UserContext.tenantId();

        // 验证用户数量限制
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant != null && tenant.getMaxUsers() != null && tenant.getMaxUsers() > 0) {
            int currentCount = tenantService.countTenantUsers(tenantId);
            if (currentCount >= tenant.getMaxUsers()) {
                throw new IllegalStateException("已达到最大用户数限制: " + tenant.getMaxUsers());
            }
        }

        // 验证用户名唯一（全局唯一）
        QueryWrapper<User> userQuery = new QueryWrapper<>();
        userQuery.eq("username", userData.getUsername());
        if (userService.count(userQuery) > 0) {
            throw new IllegalArgumentException("用户名已存在: " + userData.getUsername());
        }

        // 设置租户信息
        userData.setTenantId(tenantId);
        userData.setIsTenantOwner(false);
        userData.setPassword(passwordEncoder.encode(userData.getPassword()));
        userData.setStatus("active");
        userData.setApprovalStatus("approved");
        userData.setCreateTime(LocalDateTime.now());
        userData.setUpdateTime(LocalDateTime.now());

        // 处理角色
        if (userData.getRoleId() != null) {
            Role role = roleService.getById(userData.getRoleId());
            if (role != null) {
                userData.setRoleName(role.getRoleName());
            }
        }
        if (!StringUtils.hasText(userData.getPermissionRange())) {
            userData.setPermissionRange("own");
        }

        userService.save(userData);
        return sanitizeUser(userData);
    }

    /**
     * 租户主账号查看本租户所有子账号
     */
    public Page<User> listSubAccounts(Long page, Long pageSize, String name, String roleName) {
        assertTenantOwnerOrAdmin();

        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            // 超级管理员查看所有用户
            return userService.getUserPage(page, pageSize, null, name, roleName, null);
        }

        QueryWrapper<User> query = new QueryWrapper<>();
        query.eq("tenant_id", tenantId);
        if (StringUtils.hasText(name)) {
            query.like("name", name);
        }
        if (StringUtils.hasText(roleName)) {
            query.like("role_name", roleName);
        }
        query.orderByDesc("create_time");
        Page<User> result = userService.page(new Page<>(page != null ? page : 1, pageSize != null ? pageSize : 20), query);
        if (result.getRecords() != null) {
            result.setRecords(result.getRecords().stream().map(this::sanitizeUser).collect(Collectors.toList()));
        }
        return result;
    }

    /**
     * 租户主账号更新子账号
     */
    public boolean updateSubAccount(User userData) {
        assertTenantOwner();

        User existing = userService.getById(userData.getId());
        if (existing == null) {
            throw new IllegalArgumentException("用户不存在");
        }

        Long tenantId = UserContext.tenantId();
        if (!tenantId.equals(existing.getTenantId())) {
            throw new AccessDeniedException("无权操作其他租户的用户");
        }

        // 禁止修改 tenantId 和 isTenantOwner
        userData.setTenantId(null);
        userData.setIsTenantOwner(null);
        if (StringUtils.hasText(userData.getPassword())) {
            userData.setPassword(passwordEncoder.encode(userData.getPassword()));
        } else {
            userData.setPassword(null);
        }
        userData.setUpdateTime(LocalDateTime.now());

        // 处理角色
        if (userData.getRoleId() != null) {
            Role role = roleService.getById(userData.getRoleId());
            if (role != null) {
                userData.setRoleName(role.getRoleName());
            }
        }

        return userService.updateById(userData);
    }

    /**
     * 租户主账号删除子账号
     */
    public boolean deleteSubAccount(Long userId) {
        assertTenantOwner();

        User existing = userService.getById(userId);
        if (existing == null) {
            throw new IllegalArgumentException("用户不存在");
        }

        Long tenantId = UserContext.tenantId();
        if (!tenantId.equals(existing.getTenantId())) {
            throw new AccessDeniedException("无权操作其他租户的用户");
        }
        if (Boolean.TRUE.equals(existing.getIsTenantOwner())) {
            throw new IllegalStateException("不能删除租户主账号");
        }

        return userService.removeById(userId);
    }

    /**
     * 获取当前用户的租户信息
     */
    public Map<String, Object> myTenant() {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> result = new HashMap<>();
        if (tenantId == null) {
            result.put("isSuperAdmin", true);
            result.put("tenant", null);
        } else {
            Tenant tenant = tenantService.getById(tenantId);
            result.put("isSuperAdmin", false);
            result.put("tenant", tenant);
            result.put("isTenantOwner", UserContext.isTenantOwner());
            result.put("currentUsers", tenantService.countTenantUsers(tenantId));
            result.put("maxUsers", tenant != null ? tenant.getMaxUsers() : 0);
        }
        return result;
    }

    // ========== 辅助方法 ==========

    private void assertSuperAdmin() {
        if (!UserContext.isSuperAdmin()) {
            throw new AccessDeniedException("仅超级管理员可执行此操作");
        }
    }

    private void assertTenantOwner() {
        if (UserContext.isSuperAdmin()) return; // 超级管理员可以代替操作
        if (!UserContext.isTenantOwner()) {
            throw new AccessDeniedException("仅租户主账号可执行此操作");
        }
        if (UserContext.tenantId() == null) {
            throw new AccessDeniedException("租户信息异常");
        }
    }

    private void assertTenantOwnerOrAdmin() {
        if (UserContext.isSuperAdmin()) return;
        if (UserContext.isTenantOwner()) return;
        if (UserContext.isTopAdmin()) return;
        throw new AccessDeniedException("无权限操作");
    }

    private Role findAdminRole() {
        QueryWrapper<Role> query = new QueryWrapper<>();
        query.eq("role_code", "admin").or().eq("role_name", "管理员");
        query.last("LIMIT 1");
        return roleService.getOne(query);
    }

    private User sanitizeUser(User user) {
        if (user != null) {
            user.setPassword(null);
        }
        return user;
    }

    // ========== 角色模板管理 ==========

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
    @Transactional(rollbackFor = Exception.class)
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
    @Transactional(rollbackFor = Exception.class)
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

    // ========== 租户权限天花板管理 ==========

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

    /**
     * 设置租户权限天花板
     * @param tenantId 租户ID
     * @param grantedPermissionIds 允许的权限ID列表（传空数组=不限制）
     */
    @Transactional(rollbackFor = Exception.class)
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

    // ========== 工人自注册与审批 ==========

    /**
     * 工人通过小程序注册（无需登录）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> workerRegister(String username, String password, String name,
                                                String phone, String tenantCode) {
        // 验证租户码
        Tenant tenant = tenantService.findByTenantCode(tenantCode);
        if (tenant == null) {
            throw new IllegalArgumentException("无效的租户编码: " + tenantCode);
        }
        if (!"active".equals(tenant.getStatus())) {
            throw new IllegalArgumentException("该租户已停用");
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
        user.setCreateTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());
        userService.save(user);

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
        assertSuperAdminOrTenantOwner();

        LambdaQueryWrapper<User> query = new LambdaQueryWrapper<>();
        query.eq(User::getRegistrationStatus, "PENDING");

        Long tenantId = UserContext.tenantId();
        if (tenantId != null) {
            // 租户主账号只能看到本租户的注册申请
            query.eq(User::getTenantId, tenantId);
        }
        query.orderByDesc(User::getCreateTime);

        Page<User> result = userService.page(
                new Page<>(page != null ? page : 1, pageSize != null ? pageSize : 20), query);
        if (result.getRecords() != null) {
            result.setRecords(result.getRecords().stream().map(this::sanitizeUser).collect(Collectors.toList()));
        }
        return result;
    }

    /**
     * 审批通过注册用户
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean approveRegistration(Long userId, Long roleId) {
        assertSuperAdminOrTenantOwner();

        User user = userService.getById(userId);
        if (user == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        if (!"PENDING".equals(user.getRegistrationStatus())) {
            throw new IllegalArgumentException("该用户不在待审批状态");
        }

        // 租户主账号只能审批自己租户的用户
        Long tenantId = UserContext.tenantId();
        if (tenantId != null && !tenantId.equals(user.getTenantId())) {
            throw new AccessDeniedException("无权审批其他租户的注册申请");
        }

        // 如果指定了角色，更新角色
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
    @Transactional(rollbackFor = Exception.class)
    public boolean rejectRegistration(Long userId, String reason) {
        assertSuperAdminOrTenantOwner();

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

    // ========== 用户权限覆盖 ==========

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
    @Transactional(rollbackFor = Exception.class)
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

    // ========== 辅助方法 ==========

    private void assertSuperAdminOrTenantOwner() {
        if (UserContext.isSuperAdmin()) return;
        if (UserContext.isTenantOwner()) return;
        throw new AccessDeniedException("仅超级管理员或租户主账号可执行此操作");
    }
}
