package com.fashion.supplychain.common;

/**
 * 用户上下文 - 线程本地存储当前登录用户信息
 * 用于数据权限控制和操作追踪
 */
public class UserContext {
    private static final ThreadLocal<UserContext> HOLDER = new ThreadLocal<>();

    private String userId;
    private String username;
    private String role;
    /** 权限范围: all=全部, team=团队, own=仅自己 */
    private String permissionRange;
    /** 所属团队/班组ID */
    private String teamId;
    /** 所属租户ID（多租户隔离核心字段） */
    private Long tenantId;
    /** 是否为租户主账号 */
    private boolean tenantOwner;
    /** 是否为平台超级管理员（显式标记，跨租户全局权限） */
    private boolean superAdmin;

    /** 外发工厂ID，NULL=普通租户账号，非NULL=该用户是外发工厂账号 */
    private String factoryId;

    /** 所属组织单元ID（用于team数据权限过滤） */
    private String orgUnitId;

    public static void set(UserContext ctx) {
        HOLDER.set(ctx);
    }

    public static UserContext get() {
        return HOLDER.get();
    }

    public static String role() {
        UserContext ctx = get();
        return ctx == null ? null : ctx.getRole();
    }

    public static String userId() {
        UserContext ctx = get();
        return ctx == null ? null : ctx.getUserId();
    }

    public static String username() {
        UserContext ctx = get();
        return ctx == null ? null : ctx.getUsername();
    }

    /**
     * 获取当前租户ID
     */
    public static Long tenantId() {
        UserContext ctx = get();
        return ctx == null ? null : ctx.getTenantId();
    }

    /**
     * 判断当前用户是否为租户主账号
     */
    public static boolean isTenantOwner() {
        UserContext ctx = get();
        return ctx != null && ctx.getTenantOwner();
    }

    /**
     * 判断是否为超级管理员（平台拥有者，跨租户全局权限）
     * 优先检查显式标记，兼容旧逻辑（tenantId=null）
     */
    public static boolean isSuperAdmin() {
        UserContext ctx = get();
        if (ctx == null) return false;
        // 优先检查显式标记，兼容旧逻辑（tenantId=null）
        return ctx.getSuperAdmin() || (ctx.getTenantId() == null && isTopAdmin());
    }

    /**
     * 判断是否为顶级管理员（含租户主账号）
     */
    public static boolean isTopAdmin() {
        // 租户主账号等同于其租户内的顶级管理员
        if (isTenantOwner()) {
            return true;
        }
        String role = role();
        if (role == null) {
            return false;
        }
        String r = role.trim();
        if (r.isEmpty()) {
            return false;
        }
        if ("1".equals(r)) {
            return true;
        }
        String lower = r.toLowerCase();
        return lower.contains("admin") || r.contains("管理员");
    }

    /**
     * 判断是否为主管或以上级别
     * 顶级管理员（含租户主账号）天然拥有主管权限
     */
    public static boolean isSupervisorOrAbove() {
        // 顶级管理员（含租户主账号）直接通过
        if (isTopAdmin()) {
            return true;
        }
        String role = role();
        if (role == null) {
            return false;
        }
        String r = role.trim();
        if (r.isEmpty()) {
            return false;
        }
        if ("1".equals(r)) {
            return true;
        }
        String lower = r.toLowerCase();
        return lower.contains("admin") || lower.contains("manager") || lower.contains("supervisor")
                || r.contains("主管") || r.contains("管理员") || r.contains("管理") || r.contains("组长");
    }

    /**
     * 判断是否为组长
     */
    public static boolean isTeamLeader() {
        String role = role();
        if (role == null) {
            return false;
        }
        String r = role.trim().toLowerCase();
        return r.contains("组长") || r.contains("leader") || r.contains("班长");
    }

    /**
     * 判断是否为普通工人
     */
    public static boolean isWorker() {
        return !isTopAdmin() && !isSupervisorOrAbove();
    }

    /**
     * 判断是否可以查看所有数据
     */
    public static boolean canViewAll() {
        if (isTopAdmin()) {
            return true;
        }
        UserContext ctx = get();
        if (ctx == null) {
            return false;
        }
        String range = ctx.getPermissionRange();
        return "all".equalsIgnoreCase(range);
    }

    /**
     * 判断是否可以查看团队数据
     */
    public static boolean canViewTeam() {
        if (canViewAll()) {
            return true;
        }
        if (isTeamLeader()) {
            return true;
        }
        UserContext ctx = get();
        if (ctx == null) {
            return false;
        }
        String range = ctx.getPermissionRange();
        return "team".equalsIgnoreCase(range);
    }

    /**
     * 获取当前用户的数据过滤条件描述
     * @return all/team/own
     */
    public static String getDataScope() {
        if (canViewAll()) {
            return "all";
        }
        if (canViewTeam()) {
            return "team";
        }
        return "own";
    }

    public static void clear() {
        HOLDER.remove();
    }

    /**
     * 创建当前 UserContext 的深拷贝，用于异步线程传递
     */
    public UserContext copy() {
        UserContext copy = new UserContext();
        copy.setUserId(this.userId);
        copy.setUsername(this.username);
        copy.setRole(this.role);
        copy.setPermissionRange(this.permissionRange);
        copy.setTeamId(this.teamId);
        copy.setTenantId(this.tenantId);
        copy.setTenantOwner(this.tenantOwner);
        copy.setSuperAdmin(this.superAdmin);
        copy.setFactoryId(this.factoryId);
        copy.setOrgUnitId(this.orgUnitId);
        return copy;
    }

    /**
     * 在指定 Runnable 执行前设置 UserContext，执行后恢复原状态。
     * 用于 CompletableFuture.supplyAsync / runAsync 等异步场景传递租户上下文。
     *
     * 用法：CompletableFuture.supplyAsync(UserContext.wrap(() -> doSomething()))
     */
    public static Runnable wrap(Runnable runnable) {
        UserContext snapshot = get();
        return () -> {
            UserContext previous = get();
            try {
                if (snapshot != null) {
                    set(snapshot.copy());
                } else {
                    clear();
                }
                runnable.run();
            } finally {
                if (previous != null) {
                    set(previous);
                } else {
                    clear();
                }
            }
        };
    }

    /**
     * 在指定 Supplier 执行前设置 UserContext，执行后恢复原状态。
     * 用于 CompletableFuture.supplyAsync 等异步场景传递租户上下文。
     *
     * 用法：CompletableFuture.supplyAsync(UserContext.wrapSupplier(() -> computeResult()))
     */
    public static <T> java.util.function.Supplier<T> wrapSupplier(java.util.function.Supplier<T> supplier) {
        UserContext snapshot = get();
        return () -> {
            UserContext previous = get();
            try {
                if (snapshot != null) {
                    set(snapshot.copy());
                } else {
                    clear();
                }
                return supplier.get();
            } finally {
                if (previous != null) {
                    set(previous);
                } else {
                    clear();
                }
            }
        };
    }

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

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getPermissionRange() {
        return permissionRange;
    }

    public void setPermissionRange(String permissionRange) {
        this.permissionRange = permissionRange;
    }

    public String getTeamId() {
        return teamId;
    }

    public void setTeamId(String teamId) {
        this.teamId = teamId;
    }

    public Long getTenantId() {
        return tenantId;
    }

    public void setTenantId(Long tenantId) {
        this.tenantId = tenantId;
    }

    public boolean getTenantOwner() {
        return tenantOwner;
    }

    public void setTenantOwner(boolean tenantOwner) {
        this.tenantOwner = tenantOwner;
    }

    public boolean getSuperAdmin() {
        return superAdmin;
    }

    public void setSuperAdmin(boolean superAdmin) {
        this.superAdmin = superAdmin;
    }

    /**
     * 获取当前登录用户绑定的外发工厂ID
     * 普通租户账号返回 null
     */
    public static String factoryId() {
        UserContext ctx = get();
        return ctx == null ? null : ctx.getFactoryId();
    }

    public static boolean isFactoryUser() {
        return factoryId() != null;
    }

    public String getFactoryId() {
        return factoryId;
    }

    public void setFactoryId(String factoryId) {
        this.factoryId = factoryId;
    }

    public static String orgUnitId() {
        UserContext ctx = get();
        return ctx == null ? null : ctx.getOrgUnitId();
    }

    public String getOrgUnitId() {
        return orgUnitId;
    }

    public void setOrgUnitId(String orgUnitId) {
        this.orgUnitId = orgUnitId;
    }
}
