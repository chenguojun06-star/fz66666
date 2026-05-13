package com.fashion.supplychain.config;

import java.util.List;

public final class SecurityConstants {

    private SecurityConstants() {}

    public static final List<String> ADMIN_ROLES = List.of(
            "ROLE_ADMIN", "ROLE_admin", "ROLE_1", "ROLE_tenant_owner", "ROLE_主管", "ROLE_管理员"
    );

    public static final List<String> ADMIN_SYSTEM_ROLES = List.of(
            "ROLE_ADMIN", "ROLE_admin", "ROLE_1", "ROLE_主管", "ROLE_管理员"
    );

    public static final List<String> TENANT_OWNER_ROLES = List.of(
            "ROLE_admin", "ROLE_ADMIN", "ROLE_1", "ROLE_tenant_owner"
    );

    public static final String[] PUBLIC_STATIC_ENDPOINTS = {
            "/ws/**",
            "/error",
            "/api/system/tenant/apply",
            "/api/system/tenant/public-list",
            "/api/system/user/login",
            "/api/system/user/refresh-token",
            "/api/auth/register",
            "/openapi/**",
            "/v1/**",
            "/api/intelligence/mcp/token",
            "/api/intelligence/a2a/token",
            "/api/intelligence/wechat-ai/callback",
            "/api/intelligence/im-ai/feishu/callback",
            "/api/intelligence/im-ai/dingtalk/callback",
            "/api/intelligence/ai-advisor/chat/stream",
            "/api/webhook/**",
            "/api/ecommerce/webhook/**",
            "/api/public/**",
            "/api/crm-client/login",
            "/api/supplier-portal/login",
            "/api/wechat/mini-program/login",
            "/api/wechat/h5/jssdk-config",
            "/api/wechat/h5/oauth-login",
            "/api/wechat/h5/bind-login",
            "/api/system/tenant/registration/**",
    };

    public static final String[] ACTUATOR_PUBLIC_ENDPOINTS = {
            "/actuator/health", "/actuator/health/**", "/actuator/info", "/actuator/info/**"
    };

    public static final String[] SWAGGER_ENDPOINTS = {
            "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html"
    };

    public static final String[] FILE_DOWNLOAD_ENDPOINTS = {
            "/api/common/download/**", "/api/file/tenant-download/**"
    };

    public static final String[] USER_SELF_ENDPOINTS = {
            "/api/system/user/me*", "/api/system/user/me/**",
            "/api/system/user/permissions*", "/api/system/user/permissions/**",
            "/api/system/user/online-count",
    };

    public static final String[] PRODUCTION_ENDPOINTS = {
            "/api/production/order/by-order-no/**",
            "/api/production/order/detail/**",
            "/api/production/cutting-bundle/by-no",
            "/api/production/cutting/summary",
            "/api/production/purchase/receive",
            "/api/production/material/receive",
            "/api/production/order/node-operations/**",
    };

    public static final String[] PRODUCTION_GET_ENDPOINTS = {
            "/api/production/warehousing/list",
    };

    public static final String[] WAREHOUSE_ENDPOINTS = {
            "/api/warehouse/dashboard/**",
    };

    public static final String[] SYSTEM_TENANT_AUTH_ENDPOINTS = {
            "/api/system/serial/**",
            "/api/system/tenant/my",
            "/api/system/tenant/sub/**",
            "/api/system/tenant/role-templates",
            "/api/system/tenant/roles/**",
            "/api/system/tenant/registrations/**",
    };

    public static final String[] SYSTEM_USER_AUTH_GET_ENDPOINTS = {
            "/api/system/user/list",
    };

    public static final String[] SYSTEM_USER_AUTH_PUT_ENDPOINTS = {
            "/api/system/user/status",
    };

    public static final String[] ORGANIZATION_AUTH_GET_ENDPOINTS = {
            "/api/system/organization/tree",
            "/api/system/organization/departments",
            "/api/system/organization/members",
            "/api/system/organization/assignable-users",
    };

    public static final String[] FACTORY_AUTH_GET_ENDPOINTS = {
            "/api/system/factory/list",
            "/api/system/factory/*",
    };

    public static final String[] APP_STORE_AUTH_ENDPOINTS = {
            "/api/system/app-store/list",
            "/api/system/app-store/my-apps",
            "/api/system/app-store/my-subscriptions",
            "/api/system/app-store/start-trial",
            "/api/system/app-store/create-order",
            "/api/system/app-store/quick-setup",
    };

    public static final String[] APP_STORE_AUTH_GET_ENDPOINTS = {
            "/api/system/app-store/trial-status/**",
            "/api/system/app-store/*",
    };

    public static final String[] TENANT_PROFILE_AUTH_GET_ENDPOINTS = {
            "/api/system/tenant-intelligence-profile/current",
            "/api/system/tenant-smart-feature/list",
    };

    public static final String[] MINIPROGRAM_MENU_AUTH_ENDPOINTS = {
            "/api/system/tenant-miniprogram-menu/**",
    };

    public static final String[] DICT_AUTH_GET_ENDPOINTS = {
            "/api/system/dict/list",
            "/api/system/dict/by-type",
    };

    public static final String[] ORDER_REMARK_AUTH_ENDPOINTS = {
            "/api/system/order-remark/**",
    };

    public static final String[] ADMIN_USER_MANAGEMENT_ENDPOINTS = {
            "/api/system/user/pending",
            "/api/system/user/*/approve",
            "/api/system/user/*/reject",
    };

    public static final String[] ADMIN_SYSTEM_ENDPOINTS = {
            "/actuator/**",
            "/api/system/diag/**",
    };

    public static final String[] SUPPLIER_USER_ENDPOINTS = {
            "/api/supplier-user/**",
    };

    public static final String[] TENANT_OWNER_ENDPOINTS = {
            "/api/system/tenant/**",
            "/api/system/**",
    };
}