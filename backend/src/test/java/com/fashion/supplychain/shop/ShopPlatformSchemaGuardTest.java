package com.fashion.supplychain.shop;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * P0 平台级电商的「结构性」守护。
 *
 * <p>这三件事都不是业务逻辑，但**任何一件被后人改掉都会直接出事故**，
 * 且都不会被编译期或普通单测发现：
 * <ol>
 *   <li>两张平台表若被移出 {@code TenantInterceptor.EXCLUDED_TABLES}，
 *       带租户上下文查询会拼出 {@code AND tenant_id = X}（列不存在）→ SQL 报错；</li>
 *   <li>迁移脚本若被误删/改名，新环境建不出表；</li>
 *   <li>{@code TokenAuthFilter} 若不再拒绝 {@code shop_consumer} 角色，
 *       消费者令牌塞进 {@code Authorization} 就能冒充「已登录员工」。</li>
 * </ol>
 */
@DisplayName("P0 平台级电商：表/迁移/令牌隔离的结构守护")
class ShopPlatformSchemaGuardTest {

    private static String read(String rel) throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/" + rel,
                "backend/src/main/java/com/fashion/supplychain/" + rel,
                "src/main/resources/" + rel,
                "backend/src/main/resources/" + rel)) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到 " + rel);
    }

    @Test
    @DisplayName("① 平台级表必须登记为「不做租户隔离」的全局表")
    void platformTablesMustBeExcluded() throws Exception {
        String s = read("common/tenant/TenantInterceptor.java");
        assertThat(s)
                .as("t_shop_consumer 无 tenant_id 列，必须排除，否则查询会拼出 AND tenant_id = X 而报错")
                .contains("t_shop_consumer");
        assertThat(s)
                .as("t_shop_consumer_address 同理")
                .contains("t_shop_consumer_address");
        int idx = s.indexOf("EXCLUDED_TABLES = Set.of(");
        assertThat(idx).as("必须定义在 EXCLUDED_TABLES 里").isGreaterThan(0);
        String block = s.substring(idx, Math.min(idx + 1200, s.length()));
        assertThat(block).contains("t_shop_consumer");
    }

    @Test
    @DisplayName("② 迁移脚本必须建两张表并给订单加 consumer_id")
    void migrationMustCreateTables() throws Exception {
        String s = read("db/migration/V202710090002__create_platform_shop_consumer.sql");
        assertThat(s).as("平台级 C 端账号表").contains("CREATE TABLE IF NOT EXISTS t_shop_consumer");
        assertThat(s).as("手机号全局唯一（一人一号）").contains("uk_phone");
        assertThat(s)
                .as("平台级地址簿")
                .contains("CREATE TABLE IF NOT EXISTS t_shop_consumer_address");
        assertThat(s).as("订单加 consumer_id 以支撑「我的订单」").contains("consumer_id");
        assertThat(s)
                .as("两张平台表都不得带 tenant_id —— 带上就退回「每租户一份账号」")
                .doesNotContain("tenant_id bigint");
    }

    @Test
    @DisplayName("③ 消费者令牌必须走独立请求头，且过滤器拒绝该角色")
    void consumerTokenMustBeIsolated() throws Exception {
        String support = read("shop/orchestration/ShopConsumerTokenSupport.java");
        assertThat(support)
                .as("消费者令牌用独立请求头，与员工 Authorization 分离")
                .contains("X-Shop-Token");

        String filter = read("auth/TokenAuthFilter.java");
        assertThat(filter)
                .as("TokenAuthFilter 必须显式拒绝消费者角色，防止冒充员工身份")
                .contains("SHOP_CONSUMER_ROLE");
        String constants = read("config/SecurityConstants.java");
        assertThat(constants).as("角色常量定义处").contains("shop_consumer");
    }

    @Test
    @DisplayName("④ 平台总览必须仅对平台超管开放")
    void platformOverviewMustBeSuperAdminOnly() throws Exception {
        String s = read("shop/controller/ShopPlatformAdminController.java");
        assertThat(s)
                .as("必须用 isSuperAdmin 判据（不能只判 isAuthenticated，否则租户管理员也能看全站）")
                .contains("UserContext.isSuperAdmin()");
    }
}
