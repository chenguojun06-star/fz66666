package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.common.AuthTokenService;
import com.fashion.supplychain.common.TokenSubject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * P0 消费者令牌单测：独立请求头、角色判据、员工令牌不可冒充消费者。
 *
 * <p>用真实 {@link AuthTokenService}（不 mock）跑一遍签发/校验，确保端到端可用。
 */
class ShopConsumerTokenSupportTest {

    private static final String SECRET = "p0-shop-consumer-secret-0123456789-abcdefghijklmnop";

    private final AuthTokenService authTokenService = new AuthTokenService(SECRET);
    private final ShopConsumerTokenSupport support = new ShopConsumerTokenSupport(authTokenService);

    @Test
    @DisplayName("签发→解析：能取回 consumerId")
    void issueAndResolve() {
        String token = support.issue("c-1", "13900000000");

        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader(ShopConsumerTokenSupport.HEADER, token);

        assertEquals("c-1", support.resolveConsumerId(req));
    }

    @Test
    @DisplayName("无请求头 / 空令牌 → 未登录")
    void noToken() {
        assertNull(support.resolveConsumerId(new MockHttpServletRequest()));
        MockHttpServletRequest blank = new MockHttpServletRequest();
        blank.addHeader(ShopConsumerTokenSupport.HEADER, "   ");
        assertNull(support.resolveConsumerId(blank));
    }

    @Test
    @DisplayName("员工令牌放进消费者请求头 → 拒绝（角色不符）")
    void staffTokenRejected() {
        TokenSubject staff = new TokenSubject();
        staff.setUserId("1001");
        staff.setUsername("admin");
        staff.setRoleName("admin");
        staff.setTenantId(2L);
        String staffToken = authTokenService.issueToken(staff, Duration.ofHours(1));

        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader(ShopConsumerTokenSupport.HEADER, staffToken);

        assertNull(support.resolveConsumerId(req));
    }

    @Test
    @DisplayName("乱码令牌 → 拒绝")
    void garbageTokenRejected() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader(ShopConsumerTokenSupport.HEADER, "not-a-jwt");
        assertNull(support.resolveConsumerId(req));
    }
}
