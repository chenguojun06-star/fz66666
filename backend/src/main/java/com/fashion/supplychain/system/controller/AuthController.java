package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.servlet.http.HttpServletRequest;
import javax.validation.Valid;
import java.util.concurrent.TimeUnit;

/**
 * 认证控制器 - 处理注册等公开接口
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private static final String REDIS_REGISTER_PREFIX = "fashion:ratelimit:register:";
    private static final int REGISTER_MAX_PER_HOUR = 5;

    @Autowired
    private UserService userService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;

    /**
     * 用户注册
     *
     * @param registerData 注册信息
     * @return 注册结果
     */
    @PostMapping("/register")
    public Result<?> register(@Valid @RequestBody User registerData, HttpServletRequest request) {
        try {
            // Redis 限流：每个 IP 每小时最多注册 5 次
            if (stringRedisTemplate != null) {
                String ip = request.getRemoteAddr();
                String rateLimitKey = REDIS_REGISTER_PREFIX + ip;
                try {
                    Long count = stringRedisTemplate.opsForValue().increment(rateLimitKey);
                    if (count != null && count == 1) {
                        stringRedisTemplate.expire(rateLimitKey, 1, TimeUnit.HOURS);
                    }
                    if (count != null && count > REGISTER_MAX_PER_HOUR) {
                        log.warn("[Register] 注册限流触发: ip={}, count={}", ip, count);
                        return Result.fail("注册请求过于频繁，请稍后再试");
                    }
                } catch (Exception re) {
                    log.warn("[Register] Redis限流检查异常，放行: {}", re.getMessage());
                }
            }
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
            log.error("注册失败: {}", e.getMessage(), e);
            return Result.fail("注册失败，请稍后重试");
        }
    }
}
