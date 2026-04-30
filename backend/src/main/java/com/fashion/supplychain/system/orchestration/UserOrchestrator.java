package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.LoginLogService;
import com.fashion.supplychain.system.service.RoleService;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.UserService;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class UserOrchestrator {

    @Autowired
    private UserService userService;
    @Autowired
    private RoleService roleService;
    @Autowired
    private LoginLogService loginLogService;
    @Autowired
    private PermissionCalculationEngine permissionEngine;
    @Autowired(required = false)
    private TenantService tenantService;
    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;
    @Autowired
    private UserLoginHelper loginHelper;
    @Autowired
    private UserApprovalHelper approvalHelper;
    @Autowired
    private com.fashion.supplychain.system.helper.UserPermissionHelper permissionHelper;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private com.fashion.supplychain.auth.AuthTokenService authTokenService;

    public java.util.Map<String, Object> refreshAccessToken(String refreshToken) {
        String userId = com.fashion.supplychain.common.UserContext.userId();
        if (userId == null || userId.isBlank()) {
            com.fashion.supplychain.auth.TokenSubject parsed = authTokenService.verifyAndParse(refreshToken);
            if (parsed != null && parsed.getUserId() != null && !parsed.getUserId().isBlank()) {
                userId = parsed.getUserId();
            }
        }
        if (userId == null || userId.isBlank()) {
            throw new IllegalStateException("无法识别当前用户");
        }
        User user = userService.getById(Long.valueOf(userId));
        if (user == null) {
            throw new IllegalStateException("用户不存在");
        }
        com.fashion.supplychain.auth.TokenSubject currentSubject = new com.fashion.supplychain.auth.TokenSubject();
        currentSubject.setUserId(String.valueOf(user.getId()));
        currentSubject.setUsername(user.getName() != null ? user.getName() : user.getUsername());
        currentSubject.setRoleId(user.getRoleId() == null ? null : String.valueOf(user.getRoleId()));
        currentSubject.setRoleName(user.getRoleName());
        currentSubject.setPermissionRange(user.getPermissionRange());
        currentSubject.setFactoryId(user.getFactoryId());
        currentSubject.setTenantId(user.getTenantId());
        currentSubject.setTenantOwner(Boolean.TRUE.equals(user.getIsTenantOwner()));
        currentSubject.setSuperAdmin(Boolean.TRUE.equals(user.getIsSuperAdmin()));
        long pwdVersion = 0L;
        if (stringRedisTemplate != null && user.getId() != null) {
            try {
                String v = stringRedisTemplate.opsForValue().get("pwd:ver:" + user.getId());
                if (v != null) pwdVersion = Long.parseLong(v);
            } catch (Exception ignored) {}
        }
        currentSubject.setPwdVersion(pwdVersion);
        String newToken = authTokenService.refreshAccessToken(refreshToken, currentSubject);
        if (newToken == null) {
            return null;
        }
        String newRefreshToken = authTokenService.issueRefreshToken(currentSubject);
        java.util.Map<String, Object> result = new java.util.HashMap<>();
        result.put("token", newToken);
        result.put("refreshToken", newRefreshToken);
        result.put("tokenTtlHours", authTokenService.getJwtTtlHours());
        return result;
    }

    public Page<User> list(Long page, Long pageSize, String username, String name, String roleName, String status) {
        return list(page, pageSize, username, name, roleName, status, null);
    }

    public Page<User> list(Long page, Long pageSize, String username, String name, String roleName, String status, String factoryId) {
        Long tenantId = UserContext.tenantId();
        String currentUserFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(currentUserFactoryId)) {
            factoryId = currentUserFactoryId;
        }
        Page<User> userPage;
        if (tenantId != null) {
            QueryWrapper<User> query = new QueryWrapper<>();
            query.eq("tenant_id", tenantId);
            if (StringUtils.hasText(username)) query.like("username", username);
            if (StringUtils.hasText(name)) query.like("name", name);
            if (StringUtils.hasText(roleName)) query.like("role_name", roleName);
            if (StringUtils.hasText(status)) query.eq("status", status);
            if (StringUtils.hasText(factoryId)) query.eq("factory_id", factoryId);
            else query.isNull("factory_id");
            userPage = userService.page(new Page<>(page != null ? page : 1, pageSize != null ? pageSize : 10), query);
        } else {
            userPage = userService.getUserPage(page, pageSize, username, name, roleName, status);
        }
        if (userPage != null && userPage.getRecords() != null) {
            userPage.getRecords().forEach(this::sanitizeUser);
        }
        return userPage;
    }

    public User getById(Long id) {
        User user = userService.getById(id);
        if (user == null) throw new NoSuchElementException("用户不存在");
        Long tenantId = UserContext.tenantId();
        if (tenantId != null && !tenantId.equals(user.getTenantId())) {
            throw new AccessDeniedException("无权查看其他租户的用户");
        }
        sanitizeUser(user);
        return user;
    }

    public boolean add(User user) {
        if (!UserContext.isTopAdmin()) throw new AccessDeniedException("无权限操作");
        syncRoleFields(user);
        boolean success = userService.saveUser(user);
        if (!success) throw new IllegalStateException("新增失败");
        saveOperationLog("user", user == null ? null : String.valueOf(user.getId()), user == null ? null : user.getUsername(), "CREATE", TextUtils.safeText(user == null ? null : user.getOperationRemark()));
        return true;
    }

    public boolean update(User user) {
        if (!UserContext.isTopAdmin()) throw new AccessDeniedException("无权限操作");
        if (user == null) throw new IllegalArgumentException("用户信息不能为空");
        String remark = TextUtils.safeText(user.getOperationRemark());
        if (!StringUtils.hasText(remark)) throw new IllegalArgumentException("操作原因不能为空");
        syncRoleFields(user);
        boolean success = userService.updateUser(user);
        if (!success) throw new IllegalStateException("更新失败");
        saveOperationLog("user", user == null ? null : String.valueOf(user.getId()), user == null ? null : user.getUsername(), "UPDATE", remark);
        return true;
    }

    public boolean delete(Long id) { return delete(id, null); }

    public boolean delete(Long id, String remark) {
        if (!UserContext.isTopAdmin()) throw new AccessDeniedException("无权限操作");
        String normalized = TextUtils.safeText(remark);
        if (!StringUtils.hasText(normalized)) throw new IllegalArgumentException("操作原因不能为空");
        User toDelete = userService.getById(id);
        String deletedUsername = toDelete != null ? toDelete.getUsername() : null;
        boolean success = userService.deleteUser(id);
        if (!success) throw new IllegalStateException("删除失败");
        saveOperationLog("user", id == null ? null : String.valueOf(id), deletedUsername, "DELETE", normalized);
        return true;
    }

    public boolean toggleStatus(Long id, String status) { return toggleStatus(id, status, null); }

    public boolean toggleStatus(Long id, String status, String remark) {
        String currentFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(currentFactoryId)) {
            User targetUser = userService.getById(id);
            if (targetUser == null) throw new IllegalArgumentException("用户不存在");
            if (!currentFactoryId.equals(targetUser.getFactoryId())) throw new AccessDeniedException("只能操作本工厂的成员");
        } else {
            if (!UserContext.isTopAdmin()) throw new AccessDeniedException("无权限操作");
            String normalized = TextUtils.safeText(remark);
            if (!StringUtils.hasText(normalized)) throw new IllegalArgumentException("操作原因不能为空");
        }
        boolean success = userService.toggleUserStatus(id, status);
        if (!success) throw new IllegalStateException("状态切换失败");
        String logRemark = StringUtils.hasText(remark) ? TextUtils.safeText(remark) : (StringUtils.hasText(currentFactoryId) ? "工厂账号操作" : "");
        saveOperationLog("user", id == null ? null : String.valueOf(id), null, "STATUS_UPDATE", logRemark);
        return true;
    }

    public Map<String, Object> loginWithToken(User loginData) { return loginHelper.loginWithToken(loginData); }
    public Map<String, Object> sendLoginSmsCode(String phone, Long tenantId) { return loginHelper.sendLoginSmsCode(phone, tenantId); }
    public Map<String, Object> loginWithPhoneCode(String phone, String code, Long tenantId) { return loginHelper.loginWithPhoneCode(phone, code, tenantId); }
    public void assertLoginAllowed(String username, String ip) { loginHelper.assertLoginAllowed(username, ip); }
    public void onLoginFailed(String username, String ip) { loginHelper.onLoginFailed(username, ip); }
    public void onLoginSuccess(String username, String ip) { loginHelper.onLoginSuccess(username, ip); }
    public void recordLoginAttempt(String username, String name, String ip, String userAgent, String status, String message) { loginHelper.recordLoginAttempt(username, name, ip, userAgent, status, message); }

    public Map<String, Object> me() {
        return permissionHelper.me();
    }

    public User updateMe(User patch) {
        User current = resolveCurrentUser();
        if (current == null) throw new NoSuchElementException("用户不存在");
        String phone = patch == null ? null : safeTrim(patch.getPhone());
        current.setPhone(phone);
        if (patch != null && patch.getAvatarUrl() != null && !patch.getAvatarUrl().isBlank()) {
            current.setAvatarUrl(patch.getAvatarUrl().trim());
        }
        boolean success = userService.updateById(current);
        if (!success) throw new IllegalStateException("保存失败");
        sanitizeUser(current);
        return current;
    }

    public void changePassword(String oldPassword, String newPassword) {
        User current = resolveCurrentUser();
        if (current == null) throw new NoSuchElementException("用户不存在");
        if (!passwordEncoder.matches(oldPassword, current.getPassword())) throw new IllegalArgumentException("原密码错误");
        current.setPassword(passwordEncoder.encode(newPassword));
        userService.updateById(current);
        loginHelper.incrementPwdVersion(current.getId());
        saveOperationLog("user", String.valueOf(current.getId()), current.getUsername(), "CHANGE_PASSWORD", "用户修改密码");
    }

    public void resetTenantOwnerPassword(Long tenantId, String newPassword) {
        permissionHelper.resetTenantOwnerPassword(tenantId, newPassword);
    }

    public Page<User> listPendingUsers(Long page, Long pageSize) { return approvalHelper.listPendingUsers(page, pageSize); }
    public boolean approveUser(Long id) { return approvalHelper.approveUser(id); }
    public boolean approveUser(Long id, String remark) { return approvalHelper.approveUser(id, remark); }
    public boolean approveUser(Long id, String remark, Long roleId) { return approvalHelper.approveUser(id, remark, roleId); }
    public boolean rejectUser(Long id, String remark) { return approvalHelper.rejectUser(id, remark); }

    public List<String> permissionsByRole(Long roleId) {
        return permissionHelper.permissionsByRole(roleId);
    }

    @org.springframework.transaction.annotation.Transactional(rollbackFor = Exception.class)
    public void adminResetMemberPassword(String userId, String newPassword) {
        permissionHelper.adminResetMemberPassword(userId, newPassword);
    }

    @org.springframework.transaction.annotation.Transactional(rollbackFor = Exception.class)
    public void ownerResetMemberPasswordToDefault(String userId) {
        permissionHelper.ownerResetMemberPasswordToDefault(userId);
    }

    private void syncRoleFields(User user) {
        if (user != null && user.getRoleId() != null) {
            Role role = roleService.getById(user.getRoleId());
            if (role != null) {
                user.setRoleName(role.getRoleName());
                user.setPermissionRange("all".equals(role.getDataScope()) ? "all" : "self");
            }
        }
    }

    private void sanitizeUser(User user) { permissionHelper.sanitizeUser(user); }

    private User resolveCurrentUser() { return permissionHelper.resolveCurrentUser(); }

    private static String safeTrim(String s) { if (s == null) return null; String t = s.trim(); return t.isEmpty() ? null : t; }

    private void saveOperationLog(String bizType, String bizId, String targetName, String action, String remark) {
        try {
            UserContext ctx = UserContext.get();
            String operator = (ctx != null ? ctx.getUsername() : null);
            loginLogService.recordOperation(bizType, bizId, targetName, action, operator, remark);
        } catch (Exception e) { log.warn("[UserOrch] 记录操作日志失败: {}", e.getMessage()); }
    }
}
