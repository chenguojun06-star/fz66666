package com.fashion.supplychain.common.tenant;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;

import java.io.Serializable;

/**
 * 安全查询工具 — 强制租户过滤的 getById / getOne 封装
 *
 * 背景：
 *   IService.getById(id) 不自动追加租户过滤，L1 TenantInterceptor 只拦截
 *   Mapper 层 SQL，不拦截 getById（它走的是 MyBatis-Plus 内置方法）。
 *   本工具确保所有按 ID 查询操作都显式包含 tenant_id 过滤。
 *
 * 使用示例：
 *   // 替换 service.getById(id)
 *   StyleInfo entity = SafeQueryHelper.getById(styleInfoService, id,
 *       StyleInfo::getId, StyleInfo::getTenantId, "款式");
 *
 *   // 写操作前查询（附加归属断言）
 *   StyleInfo entity = SafeQueryHelper.getByIdForWrite(styleInfoService, id,
 *       StyleInfo::getId, StyleInfo::getTenantId, "款式");
 */
public final class SafeQueryHelper {

    private SafeQueryHelper() {
    }

    /**
     * 按 ID + 租户过滤查询单条记录（读操作推荐）
     *
     * @param service         MyBatis-Plus IService
     * @param id              主键值
     * @param idGetter        实体主键列 getter（如 Entity::getId）
     * @param tenantIdGetter  实体租户列 getter（如 Entity::getTenantId）
     * @param entityLabel     实体中文名（用于异常信息）
     * @param <T>             实体类型
     * @return 查询结果，null 表示不存在或不属于当前租户
     */
    public static <T> T getById(IService<T> service, Serializable id,
                                 SFunction<T, ?> idGetter,
                                 SFunction<T, ?> tenantIdGetter,
                                 String entityLabel) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new BusinessException("当前无租户上下文，无法查询" + entityLabel);
        }
        return service.lambdaQuery()
                .eq(idGetter, id)
                .eq(tenantIdGetter, tenantId)
                .one();
    }

    /**
     * 按 ID + 租户过滤查询，并断言归属当前租户（写操作推荐）
     *
     * 用于 update/delete 前的查询，比 {@link #getById} 多一次租户归属断言。
     *
     * @param service         MyBatis-Plus IService
     * @param id              主键值
     * @param idGetter        实体主键列 getter
     * @param tenantIdGetter  实体租户列 getter
     * @param entityLabel     实体中文名
     * @param <T>             实体类型
     * @return 归属当前租户的实体
     * @throws BusinessException 若实体不属于当前租户
     */
    public static <T> T getByIdForWrite(IService<T> service, Serializable id,
                                         SFunction<T, ?> idGetter,
                                         SFunction<T, ?> tenantIdGetter,
                                         String entityLabel) {
        T entity = getById(service, id, idGetter, tenantIdGetter, entityLabel);
        if (entity != null) {
            Object entityTenantId = tenantIdGetter.apply(entity);
            TenantAssert.assertBelongsToCurrentTenant(
                    entityTenantId instanceof Long ? (Long) entityTenantId : null,
                    entityLabel);
        }
        return entity;
    }

    /**
     * 构建带租户过滤的 LambdaQueryWrapper（用于复杂查询场景）
     *
     * 调用方只需在此基础上追加业务条件即可。
     *
     * @param tenantIdGetter 实体租户列 getter
     * @param <T>            实体类型
     * @return 已追加 tenant_id = 当前租户 的 wrapper
     */
    public static <T> LambdaQueryWrapper<T> withTenant(SFunction<T, ?> tenantIdGetter) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new BusinessException("当前无租户上下文");
        }
        LambdaQueryWrapper<T> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(tenantIdGetter, tenantId);
        return wrapper;
    }
}
