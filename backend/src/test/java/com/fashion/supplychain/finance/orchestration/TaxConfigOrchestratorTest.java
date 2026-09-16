package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.TaxConfig;
import com.fashion.supplychain.finance.service.TaxConfigService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * 税额计算测试 —— 金额链路核心，算错直接是钱的问题。
 *
 * <p>calcTax 的规则：{@code 金额 × 税率}，结果 {@code setScale(2, HALF_UP)}；
 * 找不到对应税码配置时返回 0（而不是抛异常或 null）。
 *
 * <p>依赖处理：
 * <ul>
 *   <li>{@code TenantAssert.assertTenantContext()} 需要租户上下文 —— 用 UserContext.set 注入</li>
 *   <li>{@code taxConfigService} 需要查库 —— 用 Mockito 打桩，不启 Spring 上下文</li>
 * </ul>
 */
@DisplayName("税额计算（金额链路）")
class TaxConfigOrchestratorTest {

    private TaxConfigService taxConfigService;
    private TaxConfigOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUserId("test-user");
        UserContext.set(ctx);

        taxConfigService = Mockito.mock(TaxConfigService.class);
        // TaxConfigOrchestrator 是 @Autowired 字段注入、无显式构造器，
        // 故用反射注入 —— 不为测试改动生产代码
        orchestrator = new TaxConfigOrchestrator();
        ReflectionTestUtils.setField(orchestrator, "taxConfigService", taxConfigService);
    }

    @AfterEach
    void tearDown() {
        // ThreadLocal 必须清理，否则会污染同线程后续测试
        UserContext.clear();
    }

    private void stubTaxRate(BigDecimal rate) {
        TaxConfig cfg = new TaxConfig();
        cfg.setTaxRate(rate);
        when(taxConfigService.getOne(any(LambdaQueryWrapper.class))).thenReturn(cfg);
    }

    @Test
    @DisplayName("标准税率：100 × 13% = 13.00")
    void standardRate() {
        stubTaxRate(new BigDecimal("0.13"));
        assertEquals(0, new BigDecimal("13.00").compareTo(
                orchestrator.calcTax(new BigDecimal("100"), "VAT13")));
    }

    @Test
    @DisplayName("结果保留 2 位且 HALF_UP：0.9999 → 1.00")
    void roundHalfUpToTwoDecimals() {
        stubTaxRate(new BigDecimal("0.03"));
        // 33.33 × 0.03 = 0.9999 → HALF_UP 两位 = 1.00
        assertEquals(0, new BigDecimal("1.00").compareTo(
                orchestrator.calcTax(new BigDecimal("33.33"), "VAT3")));
    }

    @Test
    @DisplayName("找不到税码配置时返回 0，不抛异常")
    void missingConfigReturnsZero() {
        when(taxConfigService.getOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        assertEquals(0, BigDecimal.ZERO.compareTo(
                orchestrator.calcTax(new BigDecimal("100"), "NOT_EXIST")),
                "税码不存在时应返回 0，不能抛异常或返回 null（会让下游 NPE）");
    }

    @Test
    @DisplayName("金额为 0 时税额为 0")
    void zeroAmount() {
        stubTaxRate(new BigDecimal("0.13"));
        assertEquals(0, new BigDecimal("0.00").compareTo(
                orchestrator.calcTax(BigDecimal.ZERO, "VAT13")));
    }
}
