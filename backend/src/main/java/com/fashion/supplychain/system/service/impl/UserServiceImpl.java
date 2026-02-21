package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.mapper.UserMapper;
import com.fashion.supplychain.system.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import lombok.extern.slf4j.Slf4j;

/**
 * 用户服务实现类
 */
@Slf4j
@Service
public class UserServiceImpl extends ServiceImpl<UserMapper, User> implements UserService {

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Override
    public Page<User> getUserPage(Long page, Long pageSize, String username, String name, String roleName,
            String status) {
        Page<User> userPage = new Page<>(page, pageSize);

        QueryWrapper<User> queryWrapper = new QueryWrapper<>();

        if (username != null && !username.isEmpty()) {
            queryWrapper.like("username", username);
        }

        if (name != null && !name.isEmpty()) {
            queryWrapper.like("name", name);
        }

        if (roleName != null && !roleName.isEmpty()) {
            queryWrapper.like("role_name", roleName);
        }

        if (status != null && !status.isEmpty()) {
            queryWrapper.eq("status", status);
        }

        return userMapper.selectPage(userPage, queryWrapper);
    }

    @Override
    public boolean saveUser(User user) {
        if (user == null) {
            return false;
        }
        String raw = user.getPassword();
        if (StringUtils.hasText(raw) && !isBcryptHash(raw)) {
            user.setPassword(passwordEncoder.encode(raw.trim()));
        }

        // 角色同步逻辑已移至 UserOrchestrator，此处不再调用 RoleService

        return save(user);
    }

    @Override
    public boolean updateUser(User user) {
        if (user == null || user.getId() == null) {
            return false;
        }

        User existing = getById(user.getId());
        if (existing == null) {
            return false;
        }

        if (!StringUtils.hasText(user.getPassword())) {
            user.setPassword(existing.getPassword());
        } else if (!isBcryptHash(user.getPassword())) {
            user.setPassword(passwordEncoder.encode(user.getPassword().trim()));
        }

        // 角色同步逻辑已移至 UserOrchestrator，此处不再调用 RoleService

        return updateById(user);
    }

    @Override
    public boolean toggleUserStatus(Long id, String status) {
        User user = this.getById(id);
        if (user == null) {
            return false;
        }
        user.setStatus(status);
        return this.updateById(user);
    }

    @Override
    public boolean deleteUser(Long id) {
        return removeById(id);
    }

    @Override
    public User login(String username, String password) {
        return login(username, password, null);
    }

    @Override
    public User login(String username, String password, Long tenantId) {
        String u = username == null ? null : username.trim();
        String p = password == null ? null : password.trim();
        if (!StringUtils.hasText(u) || !StringUtils.hasText(p)) {
            return null;
        }

        QueryWrapper<User> queryWrapper = new QueryWrapper<User>()
                .eq("username", u)
                .in("status", "active", "ENABLED");
        if (tenantId != null) {
            queryWrapper.eq("tenant_id", tenantId);
        }
        queryWrapper.last("limit 1");

        User user = userMapper.selectOne(queryWrapper);

        // 如果按 tenantId 没找到，尝试不带 tenantId 查找超级管理员
        // 超级管理员（is_super_admin=1）可以从任意公司入口登录，不受 tenant 归属限制
        if (user == null && tenantId != null) {
            QueryWrapper<User> superAdminQuery = new QueryWrapper<User>()
                    .eq("username", u)
                    .in("status", "active", "ENABLED")
                    .eq("is_super_admin", true)
                    .last("limit 1");
            user = userMapper.selectOne(superAdminQuery);
        }

        if (user == null) {
            return null;
        }

        String stored = user.getPassword();
        if (!StringUtils.hasText(stored)) {
            return null;
        }

        boolean ok;
        if (isBcryptHash(stored)) {
            ok = passwordEncoder.matches(p, stored);
        } else {
            ok = stored.trim().equals(p);
            if (ok) {
                // 自动将明文密码升级为 BCrypt
                user.setPassword(passwordEncoder.encode(p));
                try {
                    updateById(user);
                } catch (Exception e) {
                    log.warn("明文密码升级BCrypt失败, userId={}", user.getId(), e);
                }
            }
        }

        return ok ? user : null;
    }

    @Override
    public User findByName(String name) {
        if (!StringUtils.hasText(name)) {
            return null;
        }
        String trimmedName = name.trim();
        // 先按显示名（name）查找，找不到再按登录名（username）查找
        // 因为跟单员/纸样师字段有时存的是 username 而不是 name
        User byDisplayName = userMapper.selectOne(new QueryWrapper<User>()
                .eq("name", trimmedName)
                .in("status", "active", "ENABLED")
                .last("limit 1"));
        if (byDisplayName != null) {
            return byDisplayName;
        }
        return userMapper.selectOne(new QueryWrapper<User>()
                .eq("username", trimmedName)
                .in("status", "active", "ENABLED")
                .last("limit 1"));
    }

    @Override
    public boolean existsByName(String name) {
        return findByName(name) != null;
    }

    @Override
    public User findByOpenid(String openid) {
        if (!StringUtils.hasText(openid)) {
            return null;
        }
        return lambdaQuery()
                .eq(User::getOpenid, openid)
                .in(User::getStatus, "active", "ENABLED")
                .last("LIMIT 1")
                .one();
    }

    @Override
    public boolean bindOpenid(Long userId, String openid) {
        if (userId == null || !StringUtils.hasText(openid)) {
            return false;
        }
        return lambdaUpdate()
                .eq(User::getId, userId)
                .set(User::getOpenid, openid)
                .update();
    }

    private static boolean isBcryptHash(String s) {
        if (!StringUtils.hasText(s)) {
            return false;
        }
        String v = s.trim();
        return v.startsWith("$2a$") || v.startsWith("$2b$") || v.startsWith("$2y$");
    }
}
