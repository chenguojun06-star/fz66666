package com.fashion.supplychain.intelligence.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface DataTruth {

    enum Source { REAL_DATA, AI_DERIVED, SIMULATED, DEFAULT_ESTIMATE }

    Source source() default Source.REAL_DATA;

    String description() default "";

    boolean requireTenantCheck() default true;

    boolean requireDataBacked() default false;
}
