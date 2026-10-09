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

    @Test
    @DisplayName("⑤ 跨店购物车：唯一键 + 绕过租户拦截器 + 结算按店铺分组")
    void cartTableAndCheckout() throws Exception {
        String sql = read("db/migration/V202710090003__create_shop_cart_item.sql");
        assertThat(sql).as("购物车表").contains("CREATE TABLE IF NOT EXISTS t_shop_cart_item");
        assertThat(sql)
                .as("(consumer_id, sku_id) 唯一：重复加购必须累加而不是插两行")
                .contains("uk_consumer_sku");
        assertThat(sql)
                .as("tenant_id 只作结算分组键，注释里要写清楚，免得后人误当隔离维度")
                .contains("结算分组键");

        String mapper = read("shop/mapper/ShopCartItemMapper.java");
        assertThat(mapper)
                .as("一辆车混多个店铺，绝不能被追加 AND tenant_id = 当前租户")
                .contains("@InterceptorIgnore");

        String checkout = read("shop/orchestration/ShopCheckoutOrchestrator.java");
        assertThat(checkout)
                .as("逐店独立下单：单店失败不能拖垮整批（D-513 批量操作的教训）")
                .contains("catch (Exception e)");
        assertThat(checkout)
                .as("只有下单成功才清购物车行，失败的行要留给顾客重试")
                .contains("cartOrchestrator.removeRows(cartItemIds)");
    }

    @Test
    @DisplayName("⑥ 订单详情必须同时按订单号 + consumerId 校验归属")
    void orderDetailMustCheckOwnership() throws Exception {
        String mapper = read("shop/mapper/ShopPlatformMapper.java");
        int methodIdx = mapper.indexOf("findOrderForConsumer");
        assertThat(methodIdx).as("必须提供按消费者查订单的方法").isGreaterThan(0);
        // 取方法签名**之前**的那段 SQL（@Select 在方法声明上方）
        String sqlBlock = mapper.substring(Math.max(0, methodIdx - 1500), methodIdx);
        assertThat(sqlBlock)
                .as("订单号全局唯一，但归属校验不能省 —— 否则改订单号就能看别人的订单")
                .contains("o.consumer_id = #{consumerId}");
    }

    @Test
    @DisplayName("⑦ 买家售后：只有已发货可申请，且审批仍走商家侧既有状态机")
    void buyerAfterSale() throws Exception {
        String s = read("shop/orchestration/ShopAfterSaleOrchestrator.java");
        assertThat(s)
                .as("订单归属必须用 orderNo + consumerId 双条件定位")
                .contains("platformMapper.findOrderForConsumer(orderNo, consumerId)");
        assertThat(s)
                .as("只有已发货可申请售后（未发货请走取消订单）")
                .contains("SHIPPED");
        assertThat(s)
                .as("审批不在这里重复实现 —— 库存回补/应收冲销仍归商家侧既有逻辑")
                .doesNotContain("restoreStock");
    }

    @Test
    @DisplayName("⑧ 评价：一单一款一条 + 只允许已发货订单")
    void reviewRules() throws Exception {
        String sql = read("db/migration/V202710090004__create_shop_review.sql");
        assertThat(sql).as("评价表").contains("CREATE TABLE IF NOT EXISTS t_shop_review");
        assertThat(sql)
                .as("(order_id, style_no) 唯一：一单一款只能评一次，防刷分")
                .contains("uk_order_style");
        assertThat(sql).as("评价带 tenant_id（商家查自己店铺评价要走租户隔离）").contains("tenant_id bigint");

        String mapper = read("shop/mapper/ShopReviewMapper.java");
        assertThat(mapper)
                .as("评价是租户业务数据，**不得**整体绕过租户拦截器（注解必须没有真正落在类上）")
                .doesNotContain("\n@InterceptorIgnore");

        String orc = read("shop/orchestration/ShopReviewOrchestrator.java");
        assertThat(orc).as("只有已发货可评价").contains("SHIPPED");
        assertThat(orc).as("款式必须在该订单里").contains("该商品不在此订单中");
    }

    @Test
    @DisplayName("⑨ 买家取消订单：必须切到订单所属租户再复用商家侧取消逻辑")
    void buyerCancelReusesMerchantLogic() throws Exception {
        String s = read("shop/orchestration/ShopBuyerOrderOrchestrator.java");
        assertThat(s)
                .as("必须按 orderNo + consumerId 双条件定位（买家只能取消自己的订单）")
                .contains("platformMapper.findOrderForConsumer(orderNo, consumerId)");
        assertThat(s)
                .as("必须复用商家侧既有取消逻辑（回补库存/撤销应收各只有一份实现）")
                .contains("shopAdminOrchestrator.cancelOrder(orderId, reasonText)");
        assertThat(s)
                .as("调用前必须切到订单所属租户上下文，否则 requireOrder 会 NPE / 越权")
                .contains("tenantContextRunner.runVoid(tenantId, operator");
        assertThat(s)
                .as("只有待发货可取消")
                .contains("PENDING_SHIP");
    }

    @Test
    @DisplayName("⑩ 商家侧评价查看：必须有读入口，且不返回 consumer_id")
    void merchantCanSeeReviews() throws Exception {
        String s = read("shop/orchestration/ShopAdminOrchestrator.java");
        assertThat(s).as("商家侧评价分页").contains("public Map<String, Object> reviews(");
        assertThat(s).as("商家侧评价概览").contains("public Map<String, Object> reviewSummary(");
        int idx = s.indexOf("public Map<String, Object> reviews(");
        String block = s.substring(idx, Math.min(idx + 2000, s.length()));
        assertThat(block)
                .as("响应体不得带 consumer_id（对商家无意义，且属顾客隐私）")
                .doesNotContain("row.put(\"consumerId\"");
    }

    @Test
    @DisplayName("⑪ 商品池排序：只接受白名单值，杜绝把用户输入当 SQL 语义")
    void sortWhitelist() throws Exception {
        String s = read("shop/orchestration/ShopPlatformOrchestrator.java");
        assertThat(s).as("排序白名单收敛").contains("normalizeSort");
        assertThat(s).as("只允许两种价格排序").contains("\"price_asc\".equals(s) || \"price_desc\".equals(s)");

        String mapper = read("shop/mapper/ShopPlatformMapper.java");
        assertThat(mapper)
                .as("价格在 SKU 上，排序必须走 MIN(sales_price) 子查询")
                .contains("SELECT MIN(sk.sales_price) FROM t_product_sku sk");
        assertThat(mapper)
                .as("未维护售价的排最后（COALESCE 兜底），不能因为 NULL 就跑到最前面")
                .contains("COALESCE(");
    }
}
