package com.fashion.supplychain.auth;

/**
 * JWT令牌主体信息
 * 包含用户身份和权限范围信息
 */
public class TokenSubject {
    private String userId;
    private String username;
    private String roleId;
    private String roleName;
    private String openid;
    /** 数据权限范围: all=全部, team=团队, own=仅自己 */
    private String permissionRange;
    /** 所属租户ID（多租户隔离核心字段） */
    private Long tenantId;
    /** 是否为租户主账号 */
    private boolean tenantOwner;
    /** 是否为平台超级管理员（跨租户全局权限） */
    private boolean superAdmin;

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getRoleId() {
        return roleId;
    }

    public void setRoleId(String roleId) {
        this.roleId = roleId;
    }

    public String getRoleName() {
        return roleName;
    }

    public void setRoleName(String roleName) {
        this.roleName = roleName;
    }

    public String getOpenid() {
        return openid;
    }

    public void setOpenid(String openid) {
        this.openid = openid;
    }

    public String getPermissionRange() {
        return permissionRange;
    }

    public void setPermissionRange(String permissionRange) {
        this.permissionRange = permissionRange;
    }

    public Long getTenantId() {
        return tenantId;
    }

    public void setTenantId(Long tenantId) {
        this.tenantId = tenantId;
    }

    public boolean isTenantOwner() {
        return tenantOwner;
    }

    public void setTenantOwner(boolean tenantOwner) {
        this.tenantOwner = tenantOwner;
    }

    public boolean isSuperAdmin() {
        return superAdmin;
    }

    public void setSuperAdmin(boolean superAdmin) {
        this.superAdmin = superAdmin;
    }
}
