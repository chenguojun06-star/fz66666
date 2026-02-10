package com.fashion.supplychain.common.datascope;

import java.lang.annotation.*;

/**
 * 数据权限注解
 * 标注在 Mapper 方法或 Service 方法上，自动根据当前用户角色过滤数据
 *
 * 使用方式:
 * <pre>
 * @DataScope(creatorColumn = "created_by_id")  // 按创建人过滤
 * @DataScope(factoryColumn = "factory_id")      // 按工厂过滤
 * @DataScope(creatorColumn = "created_by_id", factoryColumn = "factory_id")  // 双重过滤
 * </pre>
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface DataScope {

    /**
     * 创建人ID列名（对应当前用户ID）
     * 默认为空表示不按创建人过滤
     */
    String creatorColumn() default "";

    /**
     * 工厂ID列名（对应当前用户所属工厂）
     * 默认为空表示不按工厂过滤
     */
    String factoryColumn() default "";

    /**
     * 表别名（在多表联查时指定主表别名）
     * 如 @DataScope(tableAlias = "po", creatorColumn = "created_by_id")
     * 生成：po.created_by_id = ?
     */
    String tableAlias() default "";
}
