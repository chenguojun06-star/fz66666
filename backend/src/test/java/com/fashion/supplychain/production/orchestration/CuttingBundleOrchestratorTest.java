package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.service.CuttingBundleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CuttingBundleOrchestratorTest {

    @InjectMocks
    private CuttingBundleOrchestrator orchestrator;

    @Mock
    private CuttingBundleService cuttingBundleService;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        UserContext.set(ctx);
    }

    // ── summary() ─────────────────────────────────────────────────────────────

    @Test
    void summary_bothNull_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.summary(null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("参数错误");
    }

    @Test
    void summary_bothBlank_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.summary("  ", "  "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void summary_withOrderId_callsService() {
        when(cuttingBundleService.summarize(null, "order-1"))
                .thenReturn(Map.of("total", 10));

        Map<String, Object> result = orchestrator.summary(null, "order-1");

        assertThat(result).containsKey("total");
    }

    // ── generate() ────────────────────────────────────────────────────────────

    @Test
    void generate_nullBody_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.generate(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("参数错误");
    }

    @Test
    void generate_nullOrderId_throwsIllegalArgument() {
        Map<String, Object> body = Map.of("bundles", List.of(Map.of("a", "b")));

        assertThatThrownBy(() -> orchestrator.generate(body))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("参数错误");
    }

    @Test
    void generate_emptyBundles_throwsIllegalArgument() {
        Map<String, Object> body = Map.of(
                "orderId", "order-1",
                "bundles", List.of()
        );

        assertThatThrownBy(() -> orchestrator.generate(body))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void generate_valid_callsServiceAndReturnsBundles() {
        List<Map<String, Object>> bundles = List.of(Map.of("color", "红", "size", "L", "qty", 10));
        Map<String, Object> body = Map.of(
                "orderId", "order-1",
                "bundles", bundles
        );
        CuttingBundle b = new CuttingBundle();
        when(cuttingBundleService.generateBundles("order-1", bundles)).thenReturn(List.of(b));

        List<CuttingBundle> result = orchestrator.generate(body);

        assertThat(result).hasSize(1);
    }

    // ── getByCode() ───────────────────────────────────────────────────────────

    @Test
    void getByCode_notFound_throwsNoSuchElement() {
        when(cuttingBundleService.getByQrCode("QR-001")).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.getByCode("QR-001"))
                .isInstanceOf(NoSuchElementException.class)
                .hasMessageContaining("裁剪扎号");
    }

    @Test
    void getByCode_found_returnsCuttingBundle() {
        CuttingBundle bundle = new CuttingBundle();
        bundle.setBundleNo(1);
        when(cuttingBundleService.getByQrCode("QR-001")).thenReturn(bundle);

        CuttingBundle result = orchestrator.getByCode("QR-001");

        assertThat(result.getBundleNo()).isEqualTo(1);
    }

    // ── getByBundleNo() ───────────────────────────────────────────────────────

    @Test
    void getByBundleNo_notFound_throwsNoSuchElement() {
        when(cuttingBundleService.getByBundleNo("P20260101", 5)).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.getByBundleNo("P20260101", 5))
                .isInstanceOf(NoSuchElementException.class)
                .hasMessageContaining("裁剪扎号");
    }

    @Test
    void getByBundleNo_found_returnsBundle() {
        CuttingBundle b = new CuttingBundle();
        b.setBundleNo(5);
        when(cuttingBundleService.getByBundleNo("P20260101", 5)).thenReturn(b);

        CuttingBundle result = orchestrator.getByBundleNo("P20260101", 5);

        assertThat(result.getBundleNo()).isEqualTo(5);
    }
}
