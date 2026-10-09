package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.common.AuthTokenService;
import com.fashion.supplychain.common.TokenSubject;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Duration;

/**
 * 平台 C 端消费者令牌（P0）。
 *
 * <p><b>为什么复用 JWT 但换一个请求头：</b>消费者是平台级的、无租户、无角色权限体系，
 * 与员工账号（{@code Authorization: Bearer}）是两套身份。若共用同一个请求头，
 * 员工侧的 {@code TokenAuthFilter} 会把消费者 token 当成「已登录员工」塞进
 * SecurityContext，任何只要求 {@code isAuthenticated()} 的接口都可能被误访问。
 * 因此：
 * <ol>
 *   <li>消费者 token 走独立请求头 {@code X-Shop-Token}，{@code TokenAuthFilter} 根本不看它；</li>
 *   <li>令牌内 {@code roleName = shop_consumer}，且 {@code TokenAuthFilter} 显式拒绝该角色，
 *       即使有人把它塞进 {@code Authorization} 也拿不到员工身份（双保险）。</li>
 * </ol>
 *
 * <p>令牌有效期 30 天（C 端顾客体验优先；无敏感资金操作，故不引入刷新令牌）。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ShopConsumerTokenSupport {

    /** 消费者令牌请求头 */
    public static final String HEADER = "X-Shop-Token";

    /** 令牌内角色名（也是 TokenAuthFilter 的拒绝判据，常量定义在 SecurityConstants） */
    public static final String ROLE = com.fashion.supplychain.config.SecurityConstants.SHOP_CONSUMER_ROLE;

    private static final Duration TTL = Duration.ofDays(30);

    private final AuthTokenService authTokenService;

    /** 签发消费者令牌 */
    public String issue(String consumerId, String phone) {
        TokenSubject subject = new TokenSubject();
        subject.setUserId(consumerId);
        subject.setUsername(phone);
        subject.setRoleName(ROLE);
        // 平台级账号：tenantId 必须为 null（不参与任何租户隔离），也不是超管
        subject.setTenantId(null);
        subject.setSuperAdmin(false);
        subject.setTenantOwner(false);
        return authTokenService.issueToken(subject, TTL);
    }

    /**
     * 从请求头解析消费者 id。
     *
     * <p>只认 {@code X-Shop-Token}，且校验令牌角色必须是 {@link #ROLE}，
     * 防止员工令牌被拿来当消费者令牌使用（越权读他人订单）。
     *
     * @return 消费者 id；未登录 / 令牌无效 / 角色不符 → null
     */
    public String resolveConsumerId(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        String token = request.getHeader(HEADER);
        if (!StringUtils.hasText(token)) {
            return null;
        }
        TokenSubject subject = authTokenService.verifyAndParse(token.trim());
        if (subject == null || !ROLE.equals(subject.getRoleName())) {
            return null;
        }
        return StringUtils.hasText(subject.getUserId()) ? subject.getUserId() : null;
    }
}
