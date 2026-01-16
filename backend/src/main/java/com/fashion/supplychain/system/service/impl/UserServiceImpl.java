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

/**
 * 用户服务实现类
 */
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
        String u = username == null ? null : username.trim();
        String p = password == null ? null : password.trim();
        if (!StringUtils.hasText(u) || !StringUtils.hasText(p)) {
            return null;
        }

        User user = userMapper.selectOne(new QueryWrapper<User>()
                .eq("username", u)
                .in("status", "active", "ENABLED")
                .last("limit 1"));
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
                String upgraded = passwordEncoder.encode(p);
                user.setPassword(upgraded);
                try {
                    updateById(user);
                } catch (Exception ignored) {
                }
            }
        }

        return ok ? user : null;
    }

    private static boolean isBcryptHash(String s) {
        if (!StringUtils.hasText(s)) {
            return false;
        }
        String v = s.trim();
        return v.startsWith("$2a$") || v.startsWith("$2b$") || v.startsWith("$2y$");
    }
}
