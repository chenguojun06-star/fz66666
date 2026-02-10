package com.fashion.supplychain.common.audit;

import java.lang.annotation.*;

/**
 * 操作审计日志注解
 * 标注在 Controller 或 Orchestrator 方法上，自动记录操作日志
 *
 * 使用方式:
 * <pre>
 * @AuditLog(module = "生产订单", action = "创建订单")
 * public Result<Order> createOrder(...)
 *
 * @AuditLog(module = "财务", action = "审批结算", recordParams = true)
 * public Result<Void> approveSettlement(...)
 * </pre>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface AuditLog {

    /**
     * 业务模块（如：生产订单、财务结算、库存管理）
     */
    String module() default "";

    /**
     * 操作类型（如：创建、修改、删除、审批）
     */
    String action() default "";

    /**
     * 是否记录请求参数（敏感操作建议开启）
     */
    boolean recordParams() default false;

    /**
     * 是否记录返回结果
     */
    boolean recordResult() default false;
}
