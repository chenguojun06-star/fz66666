package com.fashion.supplychain.ticket.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fashion.supplychain.pos.entity.SalesTicket;
import com.fashion.supplychain.pos.mapper.SalesTicketMapper;
import com.fashion.supplychain.ticket.TicketTypes;
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

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 电子小票 {@code TicketService} 契约测试。
 *
 * <p>守护两件直接关系"凭证可信度"的事：
 * <ol>
 *   <li><b>签收必须写时幂等</b>：顾客连点两下 / 两口子各扫一次，两个请求并发都读到
 *       UNSIGNED，若无 {@code WHERE status='UNSIGNED'} 条件，后到的会覆盖
 *       {@code signed_by}/{@code signed_time} —— 签收凭证的全部意义就是
 *       "谁、什么时候确认的"，被覆盖即成假凭证。</li>
 *   <li><b>公开可写字段必须清洗</b>：{@code signed_by} 是客户自填、暴露在公网的输入，
 *       不 trim / 不限长会被 MySQL 严格模式判超长 → sign 接口 500，
 *       控制字符还能污染小票渲染。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("TicketService - 签收写时幂等 与 公开字段清洗")
class TicketServiceTest {

    /**
     * LambdaUpdateWrapper#getSqlSegment() 需要 MyBatis-Plus 的 lambda 列缓存，
     * 单测里没有启动时的 mapper 扫描，不初始化会抛
     * "can not find lambda cache for this entity"。这里手工补上。
     */
    @BeforeAll
    static void initLambdaCache() {
        MybatisConfiguration cfg = new MybatisConfiguration();
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(cfg, ""), SalesTicket.class);
    }

    @Mock
    private SalesTicketMapper ticketMapper;

    @InjectMocks
    private TicketService service;

    private SalesTicket unsignedTicket() {
        SalesTicket t = new SalesTicket();
        t.setId(1L);
        t.setTenantId(112L);
        t.setTicketNo("T202610170001");
        t.setSignToken("a".repeat(43));
        t.setStatus(TicketTypes.STATUS_UNSIGNED);
        return t;
    }

    @SuppressWarnings("unchecked")
    private LambdaUpdateWrapper<SalesTicket> captureUpdate() {
        ArgumentCaptor<LambdaUpdateWrapper<SalesTicket>> captor =
                ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(ticketMapper).update(any(), captor.capture());
        return captor.getValue();
    }

    @Test
    @DisplayName("签收 UPDATE 必须带 status='UNSIGNED' 条件（并发下只允许一个写入成功）")
    void signUpdateMustCarryStatusCondition() {
        SalesTicket t = unsignedTicket();
        doReturn(t).when(ticketMapper).selectOne(any());
        when(ticketMapper.update(any(), any())).thenReturn(1);

        boolean ok = service.signTicket("a".repeat(43), "张三");

        assertThat(ok).isTrue();
        String where = captureUpdate().getSqlSegment();
        assertThat(where)
                .as("没有状态条件的 UPDATE 在并发下会脏写：两个请求都读到 UNSIGNED → 都写成功 → "
                        + "signed_by/signed_time 被后到者覆盖")
                .containsIgnoringCase("status");
        // 必须是以 id 为主键定位，不能变成无条件更新
        assertThat(where).containsIgnoringCase("id");
    }

    @Test
    @DisplayName("并发撞条件（affected=0）时按已签收幂等返回 true，不抛错")
    void alreadySignedByConcurrentRequestIsIdempotent() {
        SalesTicket t = unsignedTicket();
        doReturn(t).when(ticketMapper).selectOne(any());          // 本请求读到 UNSIGNED
        when(ticketMapper.update(any(), any())).thenReturn(0);     // 但被别人先写成功了

        SalesTicket signed = unsignedTicket();
        signed.setStatus(TicketTypes.STATUS_SIGNED);
        signed.setSignedBy("李四");
        doReturn(signed).when(ticketMapper).selectOne(any());      // 回读已签收

        assertThat(service.signTicket("a".repeat(43), "张三")).isTrue();
    }

    @Test
    @DisplayName("已签收的小票重复签收：幂等返回 true，且不再发起 UPDATE")
    void alreadySignedDoesNotUpdateAgain() {
        SalesTicket t = unsignedTicket();
        t.setStatus(TicketTypes.STATUS_SIGNED);
        doReturn(t).when(ticketMapper).selectOne(any());

        assertThat(service.signTicket("a".repeat(43), "张三")).isTrue();
        verify(ticketMapper, never()).update(any(), any());
    }

    @Test
    @DisplayName("作废小票签收：抛错拒绝，且不 UPDATE")
    void voidTicketCannotBeSigned() {
        SalesTicket t = unsignedTicket();
        t.setStatus(TicketTypes.STATUS_VOID);
        doReturn(t).when(ticketMapper).selectOne(any());

        org.assertj.core.api.Assertions.assertThatThrownBy(
                () -> service.signTicket("a".repeat(43), "张三"))
                .isInstanceOf(IllegalStateException.class);
        verify(ticketMapper, never()).update(any(), any());
    }

    @Test
    @DisplayName("signed_by 必须 trim + 去控制字符 + 限长（公开可写字段）")
    void signedByIsNormalized() {
        SalesTicket t = unsignedTicket();
        doReturn(t).when(ticketMapper).selectOne(any());
        when(ticketMapper.update(any(), any())).thenReturn(1);

        // 前后空白 + 控制字符 + 超长
        String dirty = "  张\u0007三" + "x".repeat(100) + "\n";
        assertThat(service.signTicket("a".repeat(43), dirty)).isTrue();

        ArgumentCaptor<SalesTicket> entity = ArgumentCaptor.forClass(SalesTicket.class);
        // 用 update(entity, wrapper) 之 entity 入参捕获实际写入值
        verify(ticketMapper).update(entity.capture(), any());
        String written = entity.getValue().getSignedBy();
        assertThat(written).as("不得残留首尾空白与控制字符").doesNotStartWith(" ").doesNotContain("\u0007");
        assertThat(written.length()).as("不得超过列宽 64").isLessThanOrEqualTo(64);
    }

    @Test
    @DisplayName("signed_by 全空白按 null 处理（不留空串占位）")
    void blankSignedByBecomesNull() {
        SalesTicket t = unsignedTicket();
        doReturn(t).when(ticketMapper).selectOne(any());
        when(ticketMapper.update(any(), any())).thenReturn(1);

        assertThat(service.signTicket("a".repeat(43), "   \t \n ")).isTrue();
        ArgumentCaptor<SalesTicket> entity = ArgumentCaptor.forClass(SalesTicket.class);
        verify(ticketMapper).update(entity.capture(), any());
        assertThat(entity.getValue().getSignedBy()).isNull();
    }

    @Test
    @DisplayName("签收 UPDATE 的字段值来自清洗后的签收人，不把原始入参写进去")
    void signedByWrittenIsNormalizedValue() {
        SalesTicket t = unsignedTicket();
        doReturn(t).when(ticketMapper).selectOne(any());
        when(ticketMapper.update(any(), any())).thenReturn(1);

        service.signTicket("a".repeat(43), " 王\u0000五 ");

        ArgumentCaptor<SalesTicket> entity = ArgumentCaptor.forClass(SalesTicket.class);
        verify(ticketMapper).update(entity.capture(), any());
        assertThat(entity.getValue().getSignedBy()).isEqualTo("王五");
    }

    @Test
    @DisplayName("token 长度不是 43 直接拒（防畸形/探测入参）")
    void malformedTokenRejected() {
        assertThat(service.findByToken(null)).isNull();
        assertThat(service.findByToken("tooshort")).isNull();
        assertThat(service.findByToken("a".repeat(42))).isNull();
        assertThat(service.findByToken("a".repeat(44))).isNull();
        verify(ticketMapper, never()).selectOne(any());
    }

    @Test
    @DisplayName("P1-1：聚合层不得再用 selectById 按主键裸查（必须显式带租户）")
    void assemblerMustNotUseBareSelectById() throws Exception {
        // 直接扫源码：selectById 不带你认为的租户条件，全靠拦截器放行，
        // 而公开请求的 UserContext 为空这个前提是隐性契约。
        java.nio.file.Path src = java.nio.file.Paths.get("src/main/java/com/fashion/supplychain"
                + "/ticket/service/TicketAssembler.java");
        String code = java.nio.file.Files.readString(src);
        assertThat(code)
                .as("改用 selectOne + 显式 eq(tenantId, ticket.getTenantId())，"
                        + "不依赖「公开请求 UserContext 为空 → 拦截器放行」")
                .doesNotContain(".selectById(");
        assertThat(code).contains("eq(PosSale::getTenantId, ticket.getTenantId())");
    }

    @Test
    @DisplayName("同源单据重复 ensure 不得产生第二张小票（幂等入口）")
    void ensureTicketIsIdempotent() {
        SalesTicket existing = unsignedTicket();
        when(ticketMapper.selectOne(any())).thenReturn(existing);
        when(ticketMapper.update(any(), any())).thenReturn(1);

        SalesTicket got = service.ensureTicket(112L, TicketTypes.POS_SALE, "99", "P20261017001");

        assertThat(got).isSameAs(existing);
        verify(ticketMapper, never()).insert(any(SalesTicket.class));
    }

    @Test
    @DisplayName("浏览计数用 SQL 自增，不得出现读-改-写（丢失更新）")
    void viewCountUsesSqlIncrement() {
        service.incrementView(1L);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<LambdaUpdateWrapper<SalesTicket>> captor = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(ticketMapper).update(eq(null), captor.capture());
        assertThat(captor.getValue().getSqlSet())
                .as("view_count = view_count + 1 才是并发安全的")
                .containsIgnoringCase("view_count")
                .contains("+ 1");
    }
}
