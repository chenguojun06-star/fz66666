package com.fashion.supplychain.config;

import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer;

public final class SecurityConfigHelper {

    private SecurityConfigHelper() {}

    public static void configure(
            AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry authz) {

        authz.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll();

        authz.requestMatchers(SecurityConstants.PUBLIC_STATIC_ENDPOINTS).permitAll();

        authz.requestMatchers(SecurityConstants.ACTUATOR_PUBLIC_ENDPOINTS).permitAll();

        authz.requestMatchers(SecurityConstants.SWAGGER_ENDPOINTS).authenticated();

        authz.requestMatchers(SecurityConstants.FILE_DOWNLOAD_ENDPOINTS).authenticated();

        authz.requestMatchers(SecurityConstants.USER_SELF_ENDPOINTS).authenticated();

        authz.requestMatchers(SecurityConstants.PRODUCTION_ENDPOINTS).authenticated();
        authz.requestMatchers(HttpMethod.GET, SecurityConstants.PRODUCTION_GET_ENDPOINTS).authenticated();

        authz.requestMatchers(SecurityConstants.WAREHOUSE_ENDPOINTS).authenticated();

        authz.requestMatchers(SecurityConstants.SYSTEM_TENANT_AUTH_ENDPOINTS).authenticated();

        authz.requestMatchers(HttpMethod.GET, SecurityConstants.SYSTEM_USER_AUTH_GET_ENDPOINTS).authenticated();
        authz.requestMatchers(HttpMethod.PUT, SecurityConstants.SYSTEM_USER_AUTH_PUT_ENDPOINTS).authenticated();

        authz.requestMatchers(HttpMethod.GET, SecurityConstants.ORGANIZATION_AUTH_GET_ENDPOINTS).authenticated();

        authz.requestMatchers(HttpMethod.GET, SecurityConstants.FACTORY_AUTH_GET_ENDPOINTS).authenticated();

        authz.requestMatchers(SecurityConstants.APP_STORE_AUTH_ENDPOINTS).authenticated();
        authz.requestMatchers(HttpMethod.GET, SecurityConstants.APP_STORE_AUTH_GET_ENDPOINTS).authenticated();

        authz.requestMatchers(HttpMethod.GET, SecurityConstants.TENANT_PROFILE_AUTH_GET_ENDPOINTS).authenticated();

        authz.requestMatchers(SecurityConstants.MINIPROGRAM_MENU_AUTH_ENDPOINTS).authenticated();

        authz.requestMatchers(HttpMethod.GET, SecurityConstants.DICT_AUTH_GET_ENDPOINTS).authenticated();

        authz.requestMatchers(SecurityConstants.ORDER_REMARK_AUTH_ENDPOINTS).authenticated();

        authz.requestMatchers(SecurityConstants.ADMIN_USER_MANAGEMENT_ENDPOINTS)
                .hasAnyAuthority(SecurityConstants.ADMIN_ROLES.toArray(new String[0]));

        authz.requestMatchers(SecurityConstants.ADMIN_SYSTEM_ENDPOINTS)
                .hasAnyAuthority(SecurityConstants.ADMIN_SYSTEM_ROLES.toArray(new String[0]));

        authz.requestMatchers(SecurityConstants.SUPPLIER_USER_ENDPOINTS)
                .hasAnyAuthority(SecurityConstants.TENANT_OWNER_ROLES.toArray(new String[0]));

        authz.requestMatchers(SecurityConstants.TENANT_OWNER_ENDPOINTS)
                .hasAnyAuthority(SecurityConstants.TENANT_OWNER_ROLES.toArray(new String[0]));

        authz.requestMatchers("/api/**").authenticated();

        authz.anyRequest().denyAll();
    }
}