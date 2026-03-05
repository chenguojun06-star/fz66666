package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialRoll;
import com.fashion.supplychain.production.service.MaterialInboundService;
import com.fashion.supplychain.production.service.MaterialRollService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MaterialRollOrchestratorTest {

    @Mock
    private MaterialRollService materialRollService;

    @Mock
    private MaterialInboundService materialInboundService;

    @InjectMocks
    private MaterialRollOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setRole("user");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    // ---- generateRolls 参数校验 ----

    @Test
    void generateRolls_rollCountZero_throwsRuntimeException() {
        assertThatThrownBy(() -> orchestrator.generateRolls("IB001", 0, 5.0, "米"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("1");
    }

    @Test
    void generateRolls_rollCountTooLarge_throwsRuntimeException() {
        assertThatThrownBy(() -> orchestrator.generateRolls("IB001", 501, 5.0, "米"))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void generateRolls_inboundNotFound_throwsRuntimeException() {
        when(materialInboundService.getById("INVALID")).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.generateRolls("INVALID", 10, 5.0, "米"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("入库单不存在");
    }

    @Test
    void generateRolls_validParams_callsSave() {
        MaterialInbound inbound = new MaterialInbound();
        inbound.setId("IB001");
        inbound.setInboundNo("IN2026001");
        inbound.setMaterialCode("M001");
        inbound.setMaterialName("棉布");
        inbound.setColor("白色");
        when(materialInboundService.getById("IB001")).thenReturn(inbound);

        orchestrator.generateRolls("IB001", 3, 5.0, "米");

        verify(materialRollService, atLeastOnce()).save(any());
    }

    // ---- scanRoll 参数校验 ----

    @Test
    void scanRoll_nullCode_throwsRuntimeException() {
        assertThatThrownBy(() -> orchestrator.scanRoll(null, "query", null, null, null))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("不能为空");
    }

    @Test
    void scanRoll_blankCode_throwsRuntimeException() {
        assertThatThrownBy(() -> orchestrator.scanRoll("  ", "query", null, null, null))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void scanRoll_validCodeNotFound_throwsRuntimeException() {
        when(materialRollService.findByRollCode("ROLL001")).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.scanRoll("ROLL001", "query", null, null, null))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("未找到");
    }

    @Test
    void scanRoll_queryAction_returnsRollInfo() {
        MaterialRoll roll = new MaterialRoll();
        roll.setRollCode("ROLL001");
        roll.setMaterialCode("M001");
        roll.setMaterialName("棉布");
        roll.setStatus("IN_STOCK");
        when(materialRollService.findByRollCode("ROLL001")).thenReturn(roll);

        var result = orchestrator.scanRoll("ROLL001", "query", null, null, null);

        assertThat(result).containsKey("rollCode");
        assertThat(result.get("rollCode")).isEqualTo("ROLL001");
    }

    @Test
    void scanRoll_invalidAction_throwsRuntimeException() {
        MaterialRoll roll = new MaterialRoll();
        roll.setRollCode("ROLL001");
        roll.setStatus("IN_STOCK");
        when(materialRollService.findByRollCode("ROLL001")).thenReturn(roll);

        assertThatThrownBy(() -> orchestrator.scanRoll("ROLL001", "unknown", null, null, null))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("无效的操作类型");
    }

    // ---- listRollsByInbound ----

    @Test
    void listRollsByInbound_delegatesToService() {
        MaterialRoll roll = new MaterialRoll();
        roll.setId("R001");
        when(materialRollService.listByInboundId("IB001")).thenReturn(List.of(roll));

        List<MaterialRoll> result = orchestrator.listRollsByInbound("IB001");

        assertThat(result).hasSize(1);
        verify(materialRollService).listByInboundId("IB001");
    }
}
