package com.fashion.supplychain.common.cache;

import java.lang.annotation.*;

@Target({ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface DataSync {

    String entityType() default "";

    String eventType() default "";

    String cacheName() default "";

    boolean evictCache() default true;

    boolean pushEvent() default true;
}
