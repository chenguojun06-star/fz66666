package com.fashion.supplychain.intelligence.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface AiGenerated {

    boolean factCheckRequired() default true;

    String confidenceField() default "confidence";

    String dataSourceField() default "dataSource";
}
