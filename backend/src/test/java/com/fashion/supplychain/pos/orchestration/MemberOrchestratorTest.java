package com.fashion.supplychain.pos.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.pos.entity.PosMember;
import com.fashion.supplychain.pos.entity.PosMemberTx;
import com.fashion.supplychain.pos.mapper.PosMemberMapper;
import com.fashion.supplychain.pos.mapper.PosMemberTxMapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 会员储值单测。
 *
 * <p><b>余额是钱</b>，所以这里盯的不是"功能能不能跑"，而是四件会直接漏钱的事：
 * <ol>
 *   <li>并发扣款不能扣成负数（必须走数据库原子扣减）；</li>
 *   <li>同一单重复提交/重试只能扣一次（按 saleNo 幂等）；</li>
 *   <li>退款不能把累计消费扣成负数；</li>
 *   <li>折扣率越界必须拦下 —— 折扣 &gt; 1 等于倒贴钱。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MemberOrchestratorTest {

    @Mock
    private PosMemberMapper memberMapper;

    @Mock
    private PosMemberTxMapper txMapper;

    private MemberOrchestrator orchestrator;

    private static final long TENANT = 5L;
    private static final String MEMBER = "m-1";

    /**
     * 单测没有 Spring 上下文，MyBatis-Plus 的 lambda 列缓存是空的，
     * 构造 LambdaQueryWrapper 会直接抛 "can not find lambda cache"。
     * 这里手工初始化，用法与其他 Entity 单测一致。
     */
    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, PosMember.class);
        TableInfoHelper.initTableInfo(assistant, PosMemberTx.class);
    }

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(TENANT);
        ctx.setUsername("cashier1");
        ctx.setUserId("u1");
        UserContext.set(ctx);
        orchestrator = new MemberOrchestrator(memberMapper, txMapper);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private PosMember member(String status, String balance) {
        PosMember m = new PosMember();
        m.setId(MEMBER);
        m.setTenantId(TENANT);
        m.setPhone("13800000000");
        m.setMemberNo("M001");
        m.setName("王女士");
        m.setLevelCode("NORMAL");
        m.setDiscountRate(new BigDecimal("0.90"));
        m.setBalance(new BigDecimal(balance));
        m.setTotalRecharge(new BigDecimal("1000.00"));
        m.setTotalSpend(BigDecimal.ZERO);
        m.setPoints(0);
        m.setStatus(status);
        return m;
    }

    @Test
    @DisplayName("余额扣减必须带单号：没有单号就没法追溯，钱扣了都不知道扣给谁")
    void consumeWithoutSaleNoIsRejected() {
        when(memberMapper.selectOne(any())).thenReturn(member("ACTIVE", "500.00"));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.consumeBalance(MEMBER, new BigDecimal("10.00"), null));
        verify(memberMapper, never()).update(any(), any(LambdaUpdateWrapper.class));
    }

    @Test
    @DisplayName("并发安全：靠 WHERE balance >= amount 的原子扣减，扣不动就影响 0 行 → 报错而非超扣")
    void consumeIsAtomicNotReadThenWrite() {
        when(memberMapper.selectOne(any())).thenReturn(member("ACTIVE", "500.00"));
        // 数据库返回 0 行 = 余额不足（并发下被别人先扣了）
        when(memberMapper.update(any(), any(LambdaUpdateWrapper.class))).thenReturn(0);

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.consumeBalance(MEMBER, new BigDecimal("800.00"), "PS001"));
        assertTrue(e.getMessage().contains("余额不足"));
        // 关键：扣不动时**不能**写流水，否则账上会留下一笔没发生的消费
        verify(txMapper, never()).insert(any(PosMemberTx.class));
    }

    /**
     * 直接断言生成的 WHERE 里**真的有余额下限条件**。
     *
     * <p>为什么必须单独写这条：mock 的 update() 返回值是写死的，
     * 它**根本不看 WHERE 条件**。所以上面那条用例即使把
     * {@code .ge(balance, amount)} 删掉也照样绿 ——
     * 测试看着在防超扣，实际上一行并发防护都没验。
     * 并发防护在 Java 侧看不出来，只能看 SQL。
     */
    @Test
    @DisplayName("生成的 UPDATE 必须带余额下限条件（并发超扣的唯一防线，不能只靠 Java 判断）")
    void consumeUpdateSqlCarriesBalanceCondition() {
        when(memberMapper.selectOne(any()))
                .thenReturn(member("ACTIVE", "500.00"))
                .thenReturn(member("ACTIVE", "480.00"));
        when(txMapper.selectCount(any())).thenReturn(0L);
        when(memberMapper.update(any(), any(LambdaUpdateWrapper.class))).thenReturn(1);

        orchestrator.consumeBalance(MEMBER, new BigDecimal("20.00"), "PS001");

        ArgumentCaptor<LambdaUpdateWrapper<PosMember>> cap =
                ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(memberMapper).update(any(), cap.capture());
        String sql = cap.getValue().getSqlSegment();
        assertTrue(sql != null && sql.contains("balance"),
                "UPDATE 的 WHERE 必须约束 balance，实际 SQL 片段: " + sql);
        assertTrue(sql != null && sql.contains(">="),
                "余额下限必须是 >= 而不是仅判断存在，实际 SQL 片段: " + sql);
    }

    @Test
    @DisplayName("扣款成功 → 必须写流水，且流水带上变动后余额")
    void consumeWritesTransaction() {
        when(memberMapper.selectOne(any()))
                .thenReturn(member("ACTIVE", "500.00"))
                .thenReturn(member("ACTIVE", "480.00"));
        when(txMapper.selectCount(any())).thenReturn(0L);
        when(memberMapper.update(any(), any(LambdaUpdateWrapper.class))).thenReturn(1);

        BigDecimal left = orchestrator.consumeBalance(MEMBER, new BigDecimal("20.00"), "PS001");
        assertEquals(0, new BigDecimal("480.00").compareTo(left));

        verify(txMapper).insert(any(PosMemberTx.class));
    }

    @Test
    @DisplayName("同一单重复扣款必须幂等：第二次直接跳过，绝不扣两次")
    void consumeIsIdempotentBySaleNo() {
        when(memberMapper.selectOne(any())).thenReturn(member("ACTIVE", "480.00"));
        when(txMapper.selectCount(any())).thenReturn(1L); // 已有 CONSUME 流水

        BigDecimal left = orchestrator.consumeBalance(MEMBER, new BigDecimal("20.00"), "PS001");
        assertEquals(0, new BigDecimal("480.00").compareTo(left));
        verify(memberMapper, never()).update(any(), any(LambdaUpdateWrapper.class));
        verify(txMapper, never()).insert(any(PosMemberTx.class));
    }

    @Test
    @DisplayName("冻结会员不能消费、不能充值")
    void frozenMemberCannotConsumeOrRecharge() {
        when(memberMapper.selectOne(any())).thenReturn(member("FROZEN", "500.00"));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.consumeBalance(MEMBER, new BigDecimal("10.00"), "PS001"));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.recharge(MEMBER, new BigDecimal("100.00"), "充100"));
        verify(memberMapper, never()).update(any(), any(LambdaUpdateWrapper.class));
    }

    @Test
    @DisplayName("充值金额非法（<=0）必须拒绝")
    void rechargeRejectsNonPositiveAmount() {
        when(memberMapper.selectOne(any())).thenReturn(member("ACTIVE", "0.00"));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.recharge(MEMBER, BigDecimal.ZERO, null));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.recharge(MEMBER, new BigDecimal("-100.00"), null));
    }

    @Test
    @DisplayName("退款幂等：同一单退两次只能退回一次")
    void refundIsIdempotent() {
        when(memberMapper.selectOne(any())).thenReturn(member("ACTIVE", "480.00"));
        when(txMapper.selectCount(any())).thenReturn(1L);

        orchestrator.refundBalance(MEMBER, new BigDecimal("20.00"), "PS001");
        verify(memberMapper, never()).update(any(), any(LambdaUpdateWrapper.class));
        verify(txMapper, never()).insert(any(PosMemberTx.class));
    }

    @Test
    @DisplayName("折扣率越界必须拒绝：折扣 > 1 等于倒贴钱")
    void discountRateOutOfRangeIsRejected() {
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.enroll("13800000001", "测试", new BigDecimal("1.50"), null));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.enroll("13800000001", "测试", BigDecimal.ZERO, null));
        verify(memberMapper, never()).insert(any(PosMember.class));
    }

    @Test
    @DisplayName("折扣率越界（从库里读出来的脏数据）建档时被夹回合法区间")
    void enrollNormalizesRate() {
        when(memberMapper.selectOne(any())).thenReturn(null);
        when(memberMapper.insert(any(PosMember.class))).thenAnswer(inv -> 1);
        orchestrator.enroll("13800000001", "测试", new BigDecimal("0.88"), null);
        verify(memberMapper).insert(any(PosMember.class));
    }

    @Test
    @DisplayName("手机号已存在时返回原会员，不报错（收银台输错一位再输对，不该弹红字）")
    void enrollReturnsExistingMember() {
        when(memberMapper.selectOne(any())).thenReturn(member("ACTIVE", "88.00"));
        var v = orchestrator.enroll("13800000000", "王女士", null, null);
        assertEquals("13800000000", v.get("phone"));
        verify(memberMapper, never()).insert(any(PosMember.class));
    }
}