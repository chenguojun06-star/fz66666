package com.fashion.supplychain.system.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.UserService;
import java.time.LocalDateTime;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Component
public class FactoryAccountHelper {

    @Autowired
    private UserService userService;
    @Autowired
    private FactoryService factoryService;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired(required = false)
    private com.fashion.supplychain.system.service.RoleService roleService;

    @Transactional(rollbackFor = Exception.class)
    public void createFactoryAccount(String factoryId, String username, String password,
                                      String name, String phone) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("仅主管级别及以上可为外发工厂创建账号");
        }
        if (!StringUtils.hasText(factoryId) || !StringUtils.hasText(username)
                || !StringUtils.hasText(password)) {
            throw new IllegalArgumentException("工厂ID、用户名、密码不能为空");
        }
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<Factory> fq = new LambdaQueryWrapper<Factory>()
                .eq(Factory::getId, factoryId)
                .eq(Factory::getDeleteFlag, 0);
        if (tenantId != null) {
            fq.eq(Factory::getTenantId, tenantId);
        }
        Factory factory = factoryService.getOne(fq);
        if (factory == null) {
            throw new IllegalArgumentException("工厂不存在或无权操作该工厂");
        }
        if ("INTERNAL".equalsIgnoreCase(factory.getFactoryType())) {
            throw new IllegalArgumentException("内部工厂无需创建独立登录账号");
        }
        QueryWrapper<User> uq = new QueryWrapper<User>().eq("username", username);
        if (userService.count(uq) > 0) {
            throw new IllegalArgumentException("用户名已存在: " + username);
        }
        com.fashion.supplychain.system.entity.Role factoryRole = null;
        if (roleService != null) {
            factoryRole = roleService.getOne(new LambdaQueryWrapper<com.fashion.supplychain.system.entity.Role>()
                    .eq(com.fashion.supplychain.system.entity.Role::getTenantId, tenantId)
                    .eq(com.fashion.supplychain.system.entity.Role::getRoleCode, "factory_owner")
                    .eq(com.fashion.supplychain.system.entity.Role::getStatus, "active")
                    .last("LIMIT 1"), false);
            if (factoryRole == null) {
                factoryRole = roleService.getOne(new LambdaQueryWrapper<com.fashion.supplychain.system.entity.Role>()
                        .eq(com.fashion.supplychain.system.entity.Role::getTenantId, tenantId)
                        .like(com.fashion.supplychain.system.entity.Role::getRoleName, "工厂")
                        .eq(com.fashion.supplychain.system.entity.Role::getStatus, "active")
                        .last("LIMIT 1"), false);
            }
        }

        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(password));
        user.setName(StringUtils.hasText(name) ? name : username);
        user.setPhone(phone);
        user.setTenantId(tenantId);
        user.setFactoryId(factoryId);
        user.setIsFactoryOwner(true);
        user.setIsTenantOwner(false);
        user.setStatus("active");
        user.setApprovalStatus("approved");
        user.setRegistrationStatus("ACTIVE");
        if (factoryRole != null) {
            user.setRoleId(factoryRole.getId());
            user.setRoleName(factoryRole.getRoleName());
            String scope = factoryRole.getDataScope();
            if ("all".equals(scope)) {
                user.setPermissionRange("all");
            } else if ("team".equals(scope)) {
                user.setPermissionRange("team");
            } else {
                user.setPermissionRange("own");
            }
        } else {
            user.setPermissionRange("own");
        }
        user.setCreateTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());
        userService.lambdaUpdate()
                .eq(User::getFactoryId, factoryId)
                .set(User::getIsFactoryOwner, false)
                .update();
        userService.saveUser(user);
    }

    @Transactional(rollbackFor = Exception.class)
    public void setFactoryOwner(String userId, String factoryId) {
        if (!StringUtils.hasText(userId) || !StringUtils.hasText(factoryId)) {
            throw new IllegalArgumentException("参数不完整");
        }
        Long userIdLong;
        try {
            userIdLong = Long.valueOf(userId);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("用户ID格式错误");
        }
        User user = userService.getById(userIdLong);
        if (user == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        if (!factoryId.equals(user.getFactoryId())) {
            throw new IllegalArgumentException("该用户不属于该工厂");
        }
        userService.lambdaUpdate()
                .eq(User::getFactoryId, factoryId)
                .set(User::getIsFactoryOwner, false)
                .update();
        userService.lambdaUpdate()
                .eq(User::getId, userIdLong)
                .set(User::getIsFactoryOwner, true)
                .update();
    }
}
