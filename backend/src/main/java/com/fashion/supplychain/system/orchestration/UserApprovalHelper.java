package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.LoginLogService;
import com.fashion.supplychain.system.service.RoleService;
import com.fashion.supplychain.system.service.UserService;
import java.time.LocalDateTime;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class UserApprovalHelper {

    @Autowired
    private UserService userService;
    @Autowired
    private LoginLogService loginLogService;

    @Autowired
    private com.fashion.supplychain.system.service.RoleService roleService;

    public Page<User> listPendingUsers(Long page, Long pageSize) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        QueryWrapper<User> wrapper = new QueryWrapper<>();
        wrapper.and(w -> w
               .eq("approval_status", "pending")
               .or()
               .isNull("approval_status")
               .or()
               .eq("registration_status", "PENDING")
        );
        wrapper.and(w -> w
               .isNull("factory_id")
               .or()
               .eq("factory_id", "")
        );
        wrapper.orderByDesc("create_time");
        Page<User> userPage = userService.page(new Page<>(page, pageSize), wrapper);
        if (userPage != null && userPage.getRecords() != null) {
            userPage.getRecords().forEach(u -> u.setPassword(null));
        }
        return userPage;
    }

    public boolean approveUser(Long id) {
        return approveUser(id, null, null);
    }

    public boolean approveUser(Long id, String remark) {
        return approveUser(id, remark, null);
    }

    public boolean approveUser(Long id, String remark, Long roleId) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        User user = userService.getById(id);
        if (user == null) {
            throw new NoSuchElementException("用户不存在");
        }
        String normalized = TextUtils.safeText(remark);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        // 同时分配角色：一步完成审批+赋权，避免小程序两次请求的不一致问题
        if (roleId != null) {
            Role role = roleService.getById(roleId);
            if (role == null) {
                throw new IllegalArgumentException("指定的角色不存在");
            }
            user.setRoleId(roleId);
            user.setRoleName(role.getRoleName());
            user.setPermissionRange("all".equals(role.getDataScope()) ? "all" : "self");
        }
        user.setApprovalStatus("approved");
        user.setApprovalTime(LocalDateTime.now());
        user.setApprovalRemark(normalized);
        user.setStatus("active");
        if ("PENDING".equals(user.getRegistrationStatus())) {
            user.setRegistrationStatus("ACTIVE");
        }
        boolean success = userService.updateById(user);
        if (!success) {
            throw new IllegalStateException("批准失败");
        }
        saveOperationLog("user", id == null ? null : String.valueOf(id), user.getUsername(), "APPROVE", normalized);
        return true;
    }

    public boolean rejectUser(Long id, String remark) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        User user = userService.getById(id);
        if (user == null) {
            throw new NoSuchElementException("用户不存在");
        }
        String normalized = TextUtils.safeText(remark);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        user.setApprovalStatus("rejected");
        user.setApprovalTime(LocalDateTime.now());
        user.setApprovalRemark(normalized);
        user.setStatus("inactive");
        if ("PENDING".equals(user.getRegistrationStatus())) {
            user.setRegistrationStatus("REJECTED");
        }
        boolean success = userService.updateById(user);
        if (!success) {
            throw new IllegalStateException("拒绝失败");
        }
        saveOperationLog("user", id == null ? null : String.valueOf(id), user.getUsername(), "REJECT", normalized);
        return true;
    }

    private void saveOperationLog(String bizType, String bizId, String targetName, String action, String remark) {
        try {
            UserContext ctx = UserContext.get();
            String operator = (ctx != null ? ctx.getUsername() : null);
            loginLogService.recordOperation(bizType, bizId, targetName, action, operator, remark);
        } catch (Exception e) {
            log.warn("[UserApproval] 记录操作日志失败: {}", e.getMessage());
        }
    }
}
