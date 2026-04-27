package com.fashion.supplychain.common.util;

public final class RoleHelper {

    private RoleHelper() {}

    public static boolean isAdminRole(String role) {
        if (role == null) return false;
        return role.contains("admin") || role.contains("ADMIN") || role.contains("manager")
                || role.contains("supervisor") || role.contains("主管") || role.contains("管理员");
    }
}
