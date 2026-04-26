package com.fashion.supplychain.intelligence.agent.tool;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface AgentToolDef {

    String name();

    String description();

    ToolDomain domain() default ToolDomain.GENERAL;

    int timeoutMs() default 30000;

    boolean readOnly() default true;
}
