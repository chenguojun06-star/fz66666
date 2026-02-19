package com.fashion.supplychain.common.tenant;

import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;

/**
 * 租户数据一致性防护工具
 *
 * 核心用途：
 * 1. 确保当前线程有有效的租户上下文（防止漏设 UserContext）
 * 2. 确保业务实体属于当前租户（防止跨租户操作）
 * 3. 确保事务内所有数据属于同一租户（防止混租户事务）
 *
 * 使用场景：
 * - Orchestrator 层事务方法入口（assertTenantContext）
 * - 跨实体操作前校验归属（assertBelongsToCurrentTenant）
 * - 异步消息处理前绑定租户（assertTenantBound）
 *
 * 口诀六条：
 * 1. 无 tenant_id，不执行 SQL
 * 2. 无 tenant_id，不发送 MQ
 * 3. 无 tenant_id，不开启事务
 * 4. 联表先匹配 tenant_id，再关联业务ID
 * 5. 一个事务，只允许一个租户
 * 6. 异步、定时、导出，全按租户跑
 */
@Slf4j
public class TenantAssert {

    private TenantAssert() {
        // 工具类禁止实例化
    }

    // ==================== 1. 上下文防护 ====================

    /**
     * 断言当前线程有有效的租户上下文
     * 用于 Orchestrator 事务方法入口
     *
     * @throws BusinessException 无租户上下文时抛出异常
     */
    public static void assertTenantContext() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new BusinessException("操作失败：缺少租户上下文，请重新登录");
        }
    }

    /**
     * 断言当前线程有有效的租户上下文，并返回 tenantId
     *
     * @return 当前租户ID（非null）
     * @throws BusinessException 无租户上下文时抛出异常
     */
    public static Long requireTenantId() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new BusinessException("操作失败：缺少租户上下文，请重新登录");
        }
        return tenantId;
    }

    /**
     * 断言当前线程有有效的租户上下文（允许超管绕过）
     * 超管场景下返回 null，调用方自行处理
     *
     * @return 当前租户ID，超管返回null
     */
    public static Long requireTenantIdOrSuperAdmin() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null && !UserContext.isSuperAdmin()) {
            throw new BusinessException("操作失败：缺少租户上下文，请重新登录");
        }
        return tenantId;
    }

    // ==================== 2. 归属防护 ====================

    /**
     * 断言实体属于当前租户
     * 防止通过伪造 ID 操作其他租户数据
     *
     * @param entityTenantId 实体的 tenant_id
     * @param entityDesc     实体描述（用于错误消息）
     * @throws BusinessException tenantId 不匹配时抛出
     */
    public static void assertBelongsToCurrentTenant(Long entityTenantId, String entityDesc) {
        Long currentTenantId = requireTenantId();
        if (entityTenantId == null || !currentTenantId.equals(entityTenantId)) {
            log.warn("[租户安全] 跨租户操作被拦截: currentTenant={}, entityTenant={}, entity={}",
                    currentTenantId, entityTenantId, entityDesc);
            throw new BusinessException("操作失败：无权操作该" + entityDesc);
        }
    }

    /**
     * 断言实体属于指定租户
     *
     * @param entityTenantId 实体的 tenant_id
     * @param expectedTenantId 预期的 tenant_id
     * @param entityDesc     实体描述
     */
    public static void assertBelongsToTenant(Long entityTenantId, Long expectedTenantId, String entityDesc) {
        if (expectedTenantId == null) {
            throw new BusinessException("操作失败：预期租户ID为空");
        }
        if (entityTenantId == null || !expectedTenantId.equals(entityTenantId)) {
            log.warn("[租户安全] 租户归属校验失败: expected={}, actual={}, entity={}",
                    expectedTenantId, entityTenantId, entityDesc);
            throw new BusinessException("操作失败：" + entityDesc + " 不属于当前租户");
        }
    }

    // ==================== 3. 事务防护 ====================

    /**
     * 断言事务内只操作同一租户的数据
     * 在 Orchestrator 层跨服务调用前验证
     *
     * @param tenantIds 事务中涉及的所有 tenant_id
     * @param operation 操作描述
     */
    public static void assertSameTenant(Long[] tenantIds, String operation) {
        if (tenantIds == null || tenantIds.length == 0) {
            return;
        }
        Long first = tenantIds[0];
        for (int i = 1; i < tenantIds.length; i++) {
            if (tenantIds[i] == null || !tenantIds[i].equals(first)) {
                log.error("[租户安全] 事务内检测到跨租户操作!!! operation={}, tenantIds={}",
                        operation, java.util.Arrays.toString(tenantIds));
                throw new BusinessException("系统错误：禁止跨租户事务操作");
            }
        }
    }

    // ==================== 4. 批量操作防护 ====================

    /**
     * 断言批量操作的所有ID都属于当前租户
     * 防止批量删除/更新时混入其他租户的数据
     *
     * @param entityTenantIds 所有实体的 tenant_id 列表
     * @param operation       操作描述
     */
    public static void assertAllBelongToCurrentTenant(java.util.Collection<Long> entityTenantIds, String operation) {
        Long currentTenantId = requireTenantId();
        for (Long tid : entityTenantIds) {
            if (tid == null || !currentTenantId.equals(tid)) {
                log.warn("[租户安全] 批量操作中检测到跨租户数据: currentTenant={}, illegalTenant={}, operation={}",
                        currentTenantId, tid, operation);
                throw new BusinessException("操作失败：批量" + operation + "中包含无权操作的数据");
            }
        }
    }

    // ==================== 5. 异步/定时任务防护 ====================

    /**
     * 在异步任务或定时任务开始前，绑定租户上下文
     * 任务完成后必须调用 clearTenantContext()
     *
     * @param tenantId 目标租户ID
     * @param taskName 任务名称（用于日志追踪）
     */
    public static void bindTenantForTask(Long tenantId, String taskName) {
        if (tenantId == null) {
            throw new BusinessException("异步任务 [" + taskName + "] 缺少租户ID");
        }
        UserContext ctx = new UserContext();
        ctx.setTenantId(tenantId);
        ctx.setUsername("SYSTEM_TASK:" + taskName);
        UserContext.set(ctx);
        log.debug("[租户上下文] 异步任务绑定: task={}, tenantId={}", taskName, tenantId);
    }

    /**
     * 清除异步任务的租户上下文（必须在 finally 块中调用）
     */
    public static void clearTenantContext() {
        UserContext.clear();
        log.debug("[租户上下文] 已清除");
    }

    // ==================== 6. 查询防护 ====================

    /**
     * 获取当前租户ID（用于手动构建查询条件）
     * 比直接用 UserContext.tenantId() 增加了 null 检查
     *
     * @return 非null的租户ID
     */
    public static Long currentTenantId() {
        return requireTenantId();
    }
}
