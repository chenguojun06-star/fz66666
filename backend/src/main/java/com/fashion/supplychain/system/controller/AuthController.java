package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

/**
 * 认证控制器 - 处理注册等公开接口
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private UserService userService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    /**
     * 用户注册
     * 
     * @param registerData 注册信息
     * @return 注册结果
     */
    @PostMapping("/register")
    public Result<?> register(@RequestBody User registerData) {
        try {
            // 验证用户名是否已存在
            User existingUser = userService.getOne(
                new LambdaQueryWrapper<User>()
                    .eq(User::getUsername, registerData.getUsername())
            );
            if (existingUser != null) {
                return Result.fail("用户名已存在");
            }

            // 创建新用户
            User newUser = new User();
            newUser.setUsername(registerData.getUsername());
            newUser.setName(registerData.getUsername()); // 默认使用用户名作为显示名称
            newUser.setPassword(passwordEncoder.encode(registerData.getPassword()));
            newUser.setPhone(registerData.getPhone());
            newUser.setEmail(registerData.getEmail());
            newUser.setStatus("DISABLED"); // 初始状态为禁用
            newUser.setApprovalStatus("PENDING"); // 待审批状态

            userService.save(newUser);

            return Result.successMessage("注册成功，请等待管理员审批");
        } catch (Exception e) {
            return Result.fail("注册失败：" + e.getMessage());
        }
    }
}
