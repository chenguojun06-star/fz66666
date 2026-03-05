package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SerialOrchestratorTest {

    @Mock
    private StyleInfoService styleInfoService;

    @Mock
    private ProductionOrderService productionOrderService;

    @InjectMocks
    private SerialOrchestrator orchestrator;

    // ── generate validation ───────────────────────────────────────────

    @Test
    void generate_nullRuleCode_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.generate(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("ruleCode不能为空");
    }

    @Test
    void generate_blankRuleCode_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.generate("   "))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("ruleCode不能为空");
    }

    @Test
    void generate_unknownRuleCode_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.generate("UNKNOWN_CODE"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不支持的ruleCode");
    }

    // ── STYLE_NO ──────────────────────────────────────────────────────

    @Test
    void generate_styleNo_noExisting_returnsFormattedNo() {
        when(styleInfoService.getOne(any())).thenReturn(null);
        when(styleInfoService.count(any())).thenReturn(0L);

        String result = orchestrator.generate("STYLE_NO");

        assertThat(result).isNotNull();
        assertThat(result).startsWith("ST");
        // format: ST(2) + yyyyMMdd(8) + 001(3) = 13
        assertThat(result).hasSize(13);
        assertThat(result).endsWith("001");
    }

    @Test
    void generate_styleNo_existingSeq_incrementsSeq() {
        // Latest existing style has suffix 005
        String today = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd"));
        String prefix = "ST" + today;
        StyleInfo existing = new StyleInfo();
        existing.setStyleNo(prefix + "005");
        when(styleInfoService.getOne(any())).thenReturn(existing);
        when(styleInfoService.count(any())).thenReturn(0L); // next seq 006 is free

        String result = orchestrator.generate("STYLE_NO");

        assertThat(result).isEqualTo(prefix + "006");
    }

    @Test
    void generate_styleNo_lowercaseInput_normalizes() {
        when(styleInfoService.getOne(any())).thenReturn(null);
        when(styleInfoService.count(any())).thenReturn(0L);

        String result = orchestrator.generate("style_no");

        assertThat(result).startsWith("ST");
    }

    // ── ORDER_NO ──────────────────────────────────────────────────────

    @Test
    void generate_orderNo_noExisting_returnsFormattedNo() {
        when(productionOrderService.getOne(any())).thenReturn(null);
        when(productionOrderService.count(any())).thenReturn(0L);

        String result = orchestrator.generate("ORDER_NO");

        assertThat(result).isNotNull();
        assertThat(result).startsWith("PO");
        // format: PO(2) + yyyyMMdd(8) + 001(3) = 13
        assertThat(result).hasSize(13);
        assertThat(result).endsWith("001");
    }

    @Test
    void generate_orderNo_existingSeq_incrementsSeq() {
        String today = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd"));
        String prefix = "PO" + today;
        ProductionOrder existing = new ProductionOrder();
        existing.setOrderNo(prefix + "010");
        when(productionOrderService.getOne(any())).thenReturn(existing);
        when(productionOrderService.count(any())).thenReturn(0L);

        String result = orchestrator.generate("ORDER_NO");

        assertThat(result).isEqualTo(prefix + "011");
    }
}
