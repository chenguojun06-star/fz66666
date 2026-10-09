package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fashion.supplychain.shop.entity.ShopConsumer;
import com.fashion.supplychain.shop.entity.ShopConsumerAddress;
import com.fashion.supplychain.shop.mapper.ShopConsumerAddressMapper;
import com.fashion.supplychain.shop.mapper.ShopConsumerMapper;
import com.fashion.supplychain.shop.mapper.ShopPlatformMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * P0 平台级 C 端消费者账号单测。
 *
 * <p>重点覆盖「一注册就登录」「重复手机号拒绝」「密码错不区分账号是否存在」
 * 「禁用账号不能登录」「地址簿第一条自动默认」这些容易在实现里写错的边界。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ShopConsumerOrchestratorTest {

    @Mock
    private ShopConsumerMapper consumerMapper;

    @Mock
    private ShopConsumerAddressMapper addressMapper;

    @Mock
    private ShopPlatformMapper platformMapper;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private ShopConsumerTokenSupport tokenSupport;

    @InjectMocks
    private ShopConsumerOrchestrator orchestrator;

    /**
     * LambdaQueryWrapper/LambdaUpdateWrapper 在解析 {@code ShopConsumer::getId} 这类方法引用时
     * 需要 MyBatis-Plus 的 TableInfo 缓存；纯 Mockito 单测没有 Spring 上下文，必须手动初始化，
     * 否则会抛 {@code can not find lambda cache for this entity}。
     */
    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, ShopConsumer.class);
        TableInfoHelper.initTableInfo(assistant, ShopConsumerAddress.class);
    }

    private ShopConsumer existing(String id, String phone, String hash, int status) {
        ShopConsumer c = new ShopConsumer();
        c.setId(id);
        c.setPhone(phone);
        c.setPasswordHash(hash);
        c.setStatus(status);
        c.setNickname("用户0000");
        return c;
    }

    @Test
    @DisplayName("注册成功：写入 BCrypt 哈希并直接返回令牌")
    void registerSuccess() {
        when(consumerMapper.selectCount(any(Wrapper.class))).thenReturn(0L);
        when(passwordEncoder.encode("abc123")).thenReturn("$2a$hash");
        when(tokenSupport.issue(any(), any())).thenReturn("tok-1");

        Map<String, Object> data = orchestrator.register("13900000000", "abc123", "小云");

        ArgumentCaptor<ShopConsumer> captor = ArgumentCaptor.forClass(ShopConsumer.class);
        verify(consumerMapper).insert(captor.capture());
        assertEquals("$2a$hash", captor.getValue().getPasswordHash());
        assertEquals("小云", captor.getValue().getNickname());
        assertEquals("tok-1", data.get("token"));
        @SuppressWarnings("unchecked")
        Map<String, Object> u = (Map<String, Object>) data.get("consumer");
        assertEquals("13900000000", u.get("phone"));
    }

    @Test
    @DisplayName("注册：昵称留空时用手机号后四位兜底")
    void registerDefaultNickname() {
        when(consumerMapper.selectCount(any(Wrapper.class))).thenReturn(0L);
        when(passwordEncoder.encode(anyString())).thenReturn("h");
        when(tokenSupport.issue(any(), any())).thenReturn("t");

        orchestrator.register("13812345678", "abc123", null);

        ArgumentCaptor<ShopConsumer> captor = ArgumentCaptor.forClass(ShopConsumer.class);
        verify(consumerMapper).insert(captor.capture());
        assertEquals("用户5678", captor.getValue().getNickname());
    }

    @Test
    @DisplayName("注册：手机号已存在 → 拒绝（唯一索引兜底前先给可读提示）")
    void registerDuplicatePhone() {
        when(consumerMapper.selectCount(any(Wrapper.class))).thenReturn(1L);
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.register("13900000000", "abc123", null));
        assertTrue(e.getMessage().contains("已注册"));
        verify(consumerMapper, never()).insert(any(ShopConsumer.class));
    }

    @Test
    @DisplayName("注册：手机号格式错 / 密码过短 → 拒绝")
    void registerValidation() {
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.register("12345", "abc123", null));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.register("13900000000", "123", null));
    }

    @Test
    @DisplayName("登录：密码正确 → 返回令牌并刷新最后登录时间")
    void loginSuccess() {
        when(consumerMapper.selectOne(any(Wrapper.class)))
                .thenReturn(existing("c1", "13900000000", "$2a$hash", 1));
        when(passwordEncoder.matches("abc123", "$2a$hash")).thenReturn(true);
        when(tokenSupport.issue("c1", "13900000000")).thenReturn("tok-2");

        Map<String, Object> data = orchestrator.login("13900000000", "abc123");

        assertEquals("tok-2", data.get("token"));
        verify(consumerMapper).updateById(any(ShopConsumer.class));
    }

    @Test
    @DisplayName("登录：密码错误与账号不存在给同一句提示（防账号枚举）")
    void loginUnifiedError() {
        when(consumerMapper.selectOne(any(Wrapper.class))).thenReturn(null);
        IllegalArgumentException noUser = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.login("13900000000", "abc123"));

        when(consumerMapper.selectOne(any(Wrapper.class)))
                .thenReturn(existing("c1", "13900000000", "$2a$hash", 1));
        when(passwordEncoder.matches("abc123", "$2a$hash")).thenReturn(false);
        IllegalArgumentException badPwd = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.login("13900000000", "abc123"));

        assertEquals(noUser.getMessage(), badPwd.getMessage());
    }

    @Test
    @DisplayName("登录：账号被禁用 → 明确提示不可登录")
    void loginDisabled() {
        when(consumerMapper.selectOne(any(Wrapper.class)))
                .thenReturn(existing("c1", "13900000000", "$2a$hash", 0));
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(true);

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.login("13900000000", "abc123"));
        assertTrue(e.getMessage().contains("禁用"));
    }

    @Test
    @DisplayName("地址簿：第一条自动设为默认，且不接受非本人 consumerId")
    void firstAddressBecomesDefault() {
        when(consumerMapper.selectById("c1")).thenReturn(existing("c1", "13900000000", "h", 1));
        when(addressMapper.selectOne(any(Wrapper.class))).thenReturn(null);
        when(addressMapper.selectCount(any(Wrapper.class))).thenReturn(0L);

        Map<String, Object> body = new HashMap<>();
        body.put("consignee", "李四");
        body.put("phone", "13900000000");
        body.put("detailAddr", "某某路 1 号");
        body.put("isDefault", false);

        orchestrator.saveAddress("c1", body);

        ArgumentCaptor<ShopConsumerAddress> captor = ArgumentCaptor.forClass(ShopConsumerAddress.class);
        verify(addressMapper).insert(captor.capture());
        assertEquals(1, captor.getValue().getIsDefault());
        assertEquals("c1", captor.getValue().getConsumerId());
    }

    @Test
    @DisplayName("地址簿：手机号格式非法 → 拒绝")
    void addressInvalidPhone() {
        when(consumerMapper.selectById("c1")).thenReturn(existing("c1", "13900000000", "h", 1));
        Map<String, Object> body = new HashMap<>();
        body.put("consignee", "李四");
        body.put("phone", "110");
        body.put("detailAddr", "某某路 1 号");
        assertThrows(IllegalArgumentException.class, () -> orchestrator.saveAddress("c1", body));
    }

    @Test
    @DisplayName("我的订单：只按令牌解析出的 consumerId 查，跨店返回")
    void myOrdersByConsumerId() {
        when(consumerMapper.selectById("c1")).thenReturn(existing("c1", "13900000000", "h", 1));
        when(platformMapper.listOrdersByConsumer("c1")).thenReturn(List.of(Map.of("orderNo", "SH1")));

        List<Map<String, Object>> orders = orchestrator.myOrders("c1");

        assertEquals(1, orders.size());
        verify(platformMapper).listOrdersByConsumer("c1");
    }

    @Test
    @DisplayName("未登录（consumerId 为空）→ 明确要求登录")
    void requireLogin() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.profile(""));
        assertTrue(e.getMessage().contains("登录"));
    }

    @Test
    @DisplayName("profile 不返回密码哈希字段")
    void profileHasNoPassword() {
        when(consumerMapper.selectById("c1")).thenReturn(existing("c1", "13900000000", "$2a$hash", 1));
        Map<String, Object> p = orchestrator.profile("c1");
        assertNotNull(p.get("phone"));
        assertFalse(p.containsKey("passwordHash"));
    }
}
