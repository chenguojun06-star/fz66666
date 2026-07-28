package com.fashion.supplychain.intelligence.agent.tool;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Agent 工具元数据注解
 *
 * <p>P3-2 升级（2026-07-28）：新增 version / deprecated 字段，支持工具版本化治理
 *
 * <ul>
 *   <li>name: 工具唯一标识（snake_case）</li>
 *   <li>description: 一句话描述</li>
 *   <li>domain: 业务领域（用于领域路由）</li>
 *   <li>timeoutMs: 单次调用最大耗时（毫秒）</li>
 *   <li>readOnly: 是否只读（写操作 false）</li>
 *   <li>version: 工具版本号（语义化版本，如 "1.0.0"，默认 "1.0.0"）</li>
 *   <li>deprecated: 是否已废弃（true 表示将被移除，调用方应迁移到替代工具）</li>
 *   <li>replacedBy: 替代工具名（deprecated=true 时建议填）</li>
 * </ul>
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface AgentToolDef {

    String name();

    String description();

    ToolDomain domain() default ToolDomain.GENERAL;

    int timeoutMs() default 30000;

    boolean readOnly() default true;

    /** P3-2：工具版本号（语义化版本，如 "1.0.0"） */
    String version() default "1.0.0";

    /** P3-2：是否已废弃（true 表示将被移除） */
    boolean deprecated() default false;

    /** P3-2：替代工具名（deprecated=true 时建议填） */
    String replacedBy() default "";
}
