package com.fashion.supplychain.common;

public class UserContext {
    private static final ThreadLocal<UserContext> HOLDER = new ThreadLocal<>();

    private String userId;
    private String username;
    private String role;

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
                || r.contains("主管") || r.contains("管理员");
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
}
