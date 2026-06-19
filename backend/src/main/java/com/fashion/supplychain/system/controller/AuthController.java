package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.orchestration.UserOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private static final String REDIS_REGISTER_PREFIX = "fashion:ratelimit:register:";
    private static final int REGISTER_MAX_PER_HOUR = 5;

    @Autowired
    private UserOrchestrator userOrchestrator;

    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;

    @PostMapping("/register")
    public Result<?> register(@Valid @RequestBody User registerData, HttpServletRequest request) {
        try {
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
            userOrchestrator.register(registerData);
            return Result.successMessage("注册成功，请等待管理员审批");
        } catch (IllegalStateException e) {
            log.warn("注册失败: {}", e.getMessage());
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            log.error("注册失败: {}", e.getMessage(), e);
            return Result.fail("注册失败，请稍后重试");
        }
    }
}
