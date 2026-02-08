package com.fashion.supplychain.common.aspect;

import com.fashion.supplychain.common.annotation.Cacheable;
import com.fashion.supplychain.service.RedisService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.core.DefaultParameterNameDiscoverer;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;
import java.util.concurrent.TimeUnit;

/**
 * 缓存切面
 * 处理自定义@Cacheable注解的缓存逻辑
 */
@Aspect
@Component
@Slf4j
@RequiredArgsConstructor
public class CacheAspect {

    private final RedisService redisService;
    private final SpelExpressionParser parser = new SpelExpressionParser();
    private final DefaultParameterNameDiscoverer discoverer = new DefaultParameterNameDiscoverer();

    @Around("@annotation(cacheable)")
    public Object around(ProceedingJoinPoint point, Cacheable cacheable) throws Throwable {
        MethodSignature signature = (MethodSignature) point.getSignature();
        Method method = signature.getMethod();
        Object[] args = point.getArgs();

        // 生成缓存key
        String cacheKey = generateKey(cacheable.value(), cacheable.key(), method, args);

        // 检查条件
        if (!cacheable.condition().isEmpty()) {
            boolean condition = evaluateCondition(cacheable.condition(), method, args);
            if (!condition) {
                log.debug("[CacheAspect] 条件不满足，跳过缓存: {}", cacheKey);
                return point.proceed();
            }
        }

        // 尝试从缓存获取
        Object cachedValue = redisService.get(cacheKey);
        if (cachedValue != null) {
            log.debug("[CacheAspect] 缓存命中: {}", cacheKey);
            return cachedValue;
        }

        // 执行方法
        Object result = point.proceed();

        // 检查是否缓存null值
        if (result == null && !cacheable.cacheNull()) {
            log.debug("[CacheAspect] 结果为null且不缓存null: {}", cacheKey);
            return result;
        }

        // 存入缓存
        redisService.set(cacheKey, result, cacheable.expire(), cacheable.unit());
        log.debug("[CacheAspect] 缓存已设置: {}, 过期时间: {} {}",
                cacheKey, cacheable.expire(), cacheable.unit());

        return result;
    }

    /**
     * 生成缓存key
     */
    private String generateKey(String value, String key, Method method, Object[] args) {
        StringBuilder sb = new StringBuilder();
        sb.append(value).append(":");
        sb.append(method.getDeclaringClass().getSimpleName()).append(":");
        sb.append(method.getName()).append(":");

        if (key.isEmpty()) {
            // 默认key：参数toString
            for (Object arg : args) {
                if (arg != null) {
                    sb.append(arg.toString()).append(":");
                }
            }
        } else {
            // SpEL表达式解析
            String spelKey = parseSpelExpression(key, method, args);
            sb.append(spelKey);
        }

        return sb.toString();
    }

    /**
     * 解析SpEL表达式
     */
    private String parseSpelExpression(String expression, Method method, Object[] args) {
        try {
            EvaluationContext context = new StandardEvaluationContext();
            String[] paramNames = null;
            if (method != null) {
                paramNames = discoverer.getParameterNames(method);
            }

            if (paramNames != null) {
                for (int i = 0; i < paramNames.length; i++) {
                    context.setVariable(paramNames[i], args[i]);
                }
            }

            // 设置args变量
            context.setVariable("args", args);

            return parser.parseExpression(expression).getValue(context, String.class);
        } catch (Exception e) {
            log.warn("[CacheAspect] SpEL解析失败: {}, 使用原始表达式", expression);
            return expression;
        }
    }

    /**
     * 评估条件表达式
     */
    private boolean evaluateCondition(String condition, Method method, Object[] args) {
        try {
            EvaluationContext context = new StandardEvaluationContext();
            String[] paramNames = discoverer.getParameterNames(method);

            if (paramNames != null) {
                for (int i = 0; i < paramNames.length; i++) {
                    context.setVariable(paramNames[i], args[i]);
                }
            }

            context.setVariable("args", args);

            Boolean result = parser.parseExpression(condition).getValue(context, Boolean.class);
            return result != null && result;
        } catch (Exception e) {
            log.warn("[CacheAspect] 条件表达式解析失败: {}, 默认返回true", condition);
            return true;
        }
    }
}
