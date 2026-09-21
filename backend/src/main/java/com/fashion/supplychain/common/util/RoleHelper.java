package com.fashion.supplychain.common.util;

import com.fashion.supplychain.common.UserContext;

/**
 * 角色判断工具。
 *
 * <p>⚠️ 禁止使用 {@code role.contains("admin")} 这类模糊匹配，原因：
 * <ul>
 *   <li>误判：会把「库存管理」「面料管理」等普通岗位当成管理员；</li>
 *   <li>漏判：会漏掉「全能管理」等自定义角色名，以及租户主账号（isTenantOwner=true）。</li>
 * </ul>
 *
 * <p>统一走 {@link UserContext} 的精确白名单判断。
 * <b>只要在请求上下文里，请优先直接调用 {@code UserContext.isSupervisorOrAbove()}</b>
 * —— 它会先判 {@code isTopAdmin()}（含 isTenantOwner），能正确识别租户主账号；
 * 本工具类仅在只有角色名字符串、拿不到上下文时使用。
 */
public final class RoleHelper {

    private RoleHelper() {}

    /** 顶级管理员（含超管、管理员、老板）；注意：只看角色名，识别不出租户主账号 */
    public static boolean isAdminRole(String role) {
        return UserContext.isTopAdminRoleName(role);
    }

    /** 主管及以上；注意：只看角色名，识别不出租户主账号 */
    public static boolean isSupervisorOrAboveRole(String role) {
        return UserContext.isSupervisorOrAboveRoleName(role);
    }
}
