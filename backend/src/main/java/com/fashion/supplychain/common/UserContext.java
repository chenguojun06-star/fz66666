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
     * 判断是否为顶级管理员
     */
    public static boolean isTopAdmin() {
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
     */
    public static boolean isSupervisorOrAbove() {
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
                || r.contains("主管") || r.contains("管理员") || r.contains("组长");
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
}
