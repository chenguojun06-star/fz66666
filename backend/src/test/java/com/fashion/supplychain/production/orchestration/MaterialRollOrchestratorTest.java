package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialRoll;
import com.fashion.supplychain.production.service.MaterialInboundService;
import com.fashion.supplychain.production.service.MaterialRollService;
import com.fashion.supplychain.production.service.MaterialStockService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 面料料卷「多卷 · 逐卷米数」回归守护。
 *
 * <p><b>缺陷背景</b>：现实中一批面料必然多卷，且每卷米数各不相同（如 50 / 48.5 / 52 米）。
 * 修复前录入层只支持「卷数 + 每卷数量」两个值，后端循环里给每卷塞同一个数量，
 * 等于强制平均值摊派，账实必然对不上。本测试守护「逐卷数量独立落库」不被回退。</p>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("面料料卷 逐卷数量 回归守护")
class MaterialRollOrchestratorTest {

    @Mock
    private MaterialRollService materialRollService;
    @Mock
    private MaterialInboundService materialInboundService;
    @Mock
    private MaterialStockService materialStockService;
    @Mock
    private com.fashion.supplychain.system.service.LoginLogService loginLogService;

    @InjectMocks
    private MaterialRollOrchestrator orchestrator;

    private MockedStatic<UserContext> mockedUserContext;

    @BeforeEach
    void setUp() {
        mockedUserContext = mockStatic(UserContext.class);
        mockedUserContext.when(UserContext::tenantId).thenReturn(1001L);
    }

    @AfterEach
    void tearDown() {
        mockedUserContext.close();
    }

    @SuppressWarnings("unchecked")
    private void stubInboundFound() {
        MaterialInbound inbound = new MaterialInbound();
        inbound.setInboundNo("IN20261006001");
        inbound.setMaterialCode("FAB-001");
        inbound.setMaterialName("雪纺面料");
        inbound.setTenantId(1001L);

        LambdaQueryChainWrapper<MaterialInbound> chain = mock(LambdaQueryChainWrapper.class);
        when(materialInboundService.lambdaQuery()).thenReturn(chain);
        when(chain.eq(any(), any())).thenReturn(chain);
        when(chain.one()).thenReturn(inbound);
    }

    @Test
    @DisplayName("逐卷明细：每卷数量按各自真实米数独立落库（50 / 48.5 / 52）")
    void generateRollsDetailed_keepsEachRollOwnQuantity() {
        stubInboundFound();
        when(materialRollService.generateRollCode()).thenReturn("MR20261006001", "MR20261006002", "MR20261006003");

        List<BigDecimal> quantities = List.of(
                new BigDecimal("50"), new BigDecimal("48.5"), new BigDecimal("52"));
        List<java.util.Map<String, Object>> result = orchestrator.generateRollsDetailed("IN-1", quantities, "米");

        ArgumentCaptor<MaterialRoll> captor = ArgumentCaptor.forClass(MaterialRoll.class);
        verify(materialRollService, times(3)).save(captor.capture());
        List<MaterialRoll> saved = captor.getAllValues();

        assertThat(saved).hasSize(3);
        assertThat(saved.get(0).getQuantity()).isEqualByComparingTo("50");
        assertThat(saved.get(1).getQuantity()).isEqualByComparingTo("48.5");
        assertThat(saved.get(2).getQuantity()).isEqualByComparingTo("52");
        assertThat(saved).allSatisfy(r -> {
            assertThat(r.getStatus()).isEqualTo("IN_STOCK");
            assertThat(r.getTenantId()).isEqualTo(1001L);
            assertThat(r.getUnit()).isEqualTo("米");
        });
        assertThat(result).hasSize(3);
        assertThat(result.get(1).get("quantity")).isEqualTo(new BigDecimal("48.5"));
    }

    @Test
    @DisplayName("快捷模式：rollCount + quantityPerRoll 展开为 N 卷相同数量（向后兼容）")
    void generateRolls_legacyMode_expandsToSameQuantity() {
        stubInboundFound();
        when(materialRollService.generateRollCode()).thenReturn("MR1", "MR2", "MR3");

        orchestrator.generateRolls("IN-1", 3, 30.5, "米");

        ArgumentCaptor<MaterialRoll> captor = ArgumentCaptor.forClass(MaterialRoll.class);
        verify(materialRollService, times(3)).save(captor.capture());
        assertThat(captor.getAllValues()).allSatisfy(r ->
                assertThat(r.getQuantity()).isEqualByComparingTo("30.5"));
    }

    @Test
    @DisplayName("校验：空明细 / 数量<=0 一律拒绝")
    void generateRollsDetailed_rejectsInvalidQuantities() {
        stubInboundFound();

        assertThatThrownBy(() -> orchestrator.generateRollsDetailed("IN-1", new ArrayList<>(), "米"))
                .hasMessageContaining("1~500");

        assertThatThrownBy(() -> orchestrator.generateRollsDetailed(
                "IN-1", List.of(new BigDecimal("50"), BigDecimal.ZERO), "米"))
                .hasMessageContaining("大于 0");

        assertThatThrownBy(() -> orchestrator.generateRollsDetailed(
                "IN-1", java.util.Collections.singletonList(null), "米"))
                .hasMessageContaining("大于 0");
    }

    @Test
    @DisplayName("事务守护：逐卷写入与快捷模式都必须带 @Transactional")
    void generateMethodsMustBeTransactional() throws Exception {
        Method detailed = MaterialRollOrchestrator.class.getMethod(
                "generateRollsDetailed", String.class, List.class, String.class);
        Method legacy = MaterialRollOrchestrator.class.getMethod(
                "generateRolls", String.class, int.class, double.class, String.class);

        assertThat(AnnotationUtils.findAnnotation(detailed, Transactional.class))
                .as("逐卷明细逐条落库必须同事务，中途失败需整体回滚")
                .isNotNull();
        assertThat(AnnotationUtils.findAnnotation(legacy, Transactional.class))
                .as("快捷模式同样必须带事务")
                .isNotNull();
    }
}