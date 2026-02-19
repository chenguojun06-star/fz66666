package com.fashion.supplychain.common.annotation;

import java.lang.annotation.*;
import java.util.concurrent.TimeUnit;

/**
 * 自定义缓存注解
 * 简化缓存配置，支持SpEL表达式
 */
@Target({ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface Cacheable {

    /**
     * 缓存名称
     */
    String value();

    /**
     * 缓存key，支持SpEL表达式
     * 例如：#userId、#user.id、#args[0]
     */
    String key() default "";

    /**
     * 过期时间
     */
    long expire() default 30;

    /**
     * 时间单位
     */
    TimeUnit unit() default TimeUnit.MINUTES;

    /**
     * 是否缓存null值
     */
    boolean cacheNull() default false;

    /**
     * 条件缓存，支持SpEL表达式
     * 例如：#result != null、#userId > 0
     */
    String condition() default "";
}
