package com.fashion.supplychain.wechat.orchestration;

import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.system.service.LoginLogService;
import com.fashion.supplychain.system.service.UserService;
import com.fashion.supplychain.wechat.client.WeChatMiniProgramClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WeChatMiniProgramAuthOrchestratorTest {

    @InjectMocks
    private WeChatMiniProgramAuthOrchestrator orchestrator;

    @Mock
    private WeChatMiniProgramClient weChatMiniProgramClient;
    @Mock
    private UserService userService;
    @Mock
    private AuthTokenService authTokenService;
    @Mock
    private LoginLogService loginLogService;
    @Mock
    private StringRedisTemplate stringRedisTemplate;

    @Test
    void login_whenCode2SessionReturnsNull_returnsFailureResponse() {
        when(weChatMiniProgramClient.code2Session(any())).thenReturn(null);
        Map<String, Object> result = orchestrator.login("any-code", null, null);
        assertThat(result).isNotNull();
        assertThat(result.get("success")).isEqualTo(false);
    }

    @Test
    void login_whenCode2SessionFails_returnsFailureResponse() {
        WeChatMiniProgramClient.Code2SessionResult failed =
                WeChatMiniProgramClient.Code2SessionResult.fail("wx error");
        when(weChatMiniProgramClient.code2Session(any())).thenReturn(failed);
        Map<String, Object> result = orchestrator.login("invalid-code", null, null);
        assertThat(result).isNotNull();
        assertThat(result.get("success")).isEqualTo(false);
    }

    @Test
    void recordLoginAttempt_doesNotThrow() {
        // Should complete without exception — no assertions needed beyond no-throw
        orchestrator.recordLoginAttempt("user1", "127.0.0.1", "TestAgent", "success", "ok");
    }

    @Test
    void generateInviteQrCode_returnsMapContainingToken() {
        // stringRedisTemplate is mocked; code null-checks it, so no NPE
        Map<String, Object> result = orchestrator.generateInviteQrCode(1L, "测试租户");
        assertThat(result).isNotNull();
        assertThat(result).containsKey("inviteToken");
    }

    @Test
    void resolveInviteToken_withBlankToken_returnsNull() {
        Map<String, Object> result = orchestrator.resolveInviteToken("  ");
        assertThat(result).isNull();
    }

    @Test
    void resolveInviteToken_withNullToken_returnsNull() {
        Map<String, Object> result = orchestrator.resolveInviteToken(null);
        assertThat(result).isNull();
    }
}
