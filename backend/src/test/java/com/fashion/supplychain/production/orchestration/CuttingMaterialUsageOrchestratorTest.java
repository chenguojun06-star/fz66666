package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.extension.conditions.update.LambdaUpdateChainWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBom;
import com.fashion.supplychain.production.entity.CuttingMaterialUsage;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.service.CuttingBomService;
import com.fashion.supplychain.production.service.CuttingMaterialUsageService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * D-823 裁剪用料台账编排测试。
 *
 * <p>守护四类行为：计划量公式（BOM×件数×(1+损耗率)）、登记口径
 * （领出-实际=余料、实际不能超领出）、余料回库（走入库链路+状态回写+部分回库）、
 * 完工快照幂等（不覆盖已登记数据）。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("D-823 裁剪用料台账")
class CuttingMaterialUsageOrchestratorTest {

    @Mock
    private CuttingMaterialUsageService usageService;

    @Mock
    private CuttingBomService cuttingBomService;

    @Mock
    private CuttingTaskService cuttingTaskService;

    @Mock
    private LambdaUpdateChainWrapper<CuttingTask> cuttingTaskUpdateChain;

    @Mock
    private MaterialPurchaseService materialPurchaseService;

    @Mock
    private MaterialInboundOrchestrator materialInboundOrchestrator;

    @InjectMocks
    private CuttingMaterialUsageOrchestrator orchestrator;

    private MockedStatic<UserContext> mockedUserContext;

    @BeforeEach
    void setUp() {
        mockedUserContext = mockStatic(UserContext.class);
        mockedUserContext.when(UserContext::tenantId).thenReturn(1001L);
        // lambdaUpdate().eq().set().update() 链式显式打桩（deep stubs 对泛型链式方法不灵）
        when(cuttingTaskService.lambdaUpdate()).thenReturn(cuttingTaskUpdateChain);
        when(cuttingTaskUpdateChain.eq(any(), any())).thenReturn(cuttingTaskUpdateChain);
        when(cuttingTaskUpdateChain.set(any(), any())).thenReturn(cuttingTaskUpdateChain);
        when(cuttingTaskUpdateChain.update()).thenReturn(true);
    }

    @AfterEach
    void tearDown() {
        mockedUserContext.close();
    }

    private CuttingTask task(String id) {
        CuttingTask t = new CuttingTask();
        t.setId(id);
        t.setProductionOrderId("oid-1");
        t.setProductionOrderNo("PO-1");
        t.setStyleNo("S-1");
        t.setCuttingQuantity(100);
        t.setOrderQuantity(100);
        t.setTenantId(1001L);
        return t;
    }

    private CuttingMaterialUsage usageRow(String code, BigDecimal planned) {
        CuttingMaterialUsage u = new CuttingMaterialUsage();
        u.setId("u-" + code);
        u.setCuttingTaskId("t-1");
        u.setMaterialCode(code);
        u.setMaterialName("面料" + code);
        u.setMaterialType("面料");
        u.setColor("黑色");
        u.setSize("150cm");
        u.setUnit("米");
        u.setPlannedAmount(planned);
        u.setRemnantAmount(BigDecimal.ZERO);
        u.setRemnantStatus("NONE");
        u.setTenantId(1001L);
        return u;
    }

    @Test
    @DisplayName("完工快照：计划量 = BOM单件用量 × 裁剪件数 × (1+损耗率)，且幂等不重复生成")
    void initFromTask_snapshotsPlannedAmount_idempotent() {
        CuttingTask t = task("t-1");
        CuttingBom bom = new CuttingBom();
        bom.setMaterialCode("M-1");
        bom.setMaterialName("面料");
        bom.setMaterialType("面料");
        bom.setColor("黑色");
        bom.setSpecification("150cm");
        bom.setUnit("米");
        bom.setUsageAmount(new BigDecimal("2"));
        bom.setLossRate(new BigDecimal("5"));
        bom.setUnitPrice(new BigDecimal("10"));
        when(cuttingTaskService.getById("t-1")).thenReturn(t);
        when(cuttingBomService.listByCuttingTaskId("t-1")).thenReturn(List.of(bom));

        // 首次：生成台账行
        when(usageService.listByCuttingTaskId("t-1"))
                .thenReturn(Collections.emptyList())   // 首次无行
                .thenReturn(List.of(usageRow("M-1", new BigDecimal("210")))); // 二次有行
        when(usageService.saveBatch(anyList())).thenReturn(true);

        orchestrator.initFromTask(t);

        ArgumentCaptor<List<CuttingMaterialUsage>> captor = ArgumentCaptor.forClass(List.class);
        verify(usageService).saveBatch(captor.capture());
        // 2 米/件 × 1.05 损耗 × 100 件 = 210 米
        assertThat(captor.getValue().get(0).getPlannedAmount()).isEqualByComparingTo("210");

        // 再次调用：已有行 → 不再 saveBatch（幂等，不覆盖已登记数据）
        orchestrator.initFromTask(t);
        verify(usageService, Mockito.times(1)).saveBatch(anyList());
    }

    @Test
      @DisplayName("完工快照失败不得拖垮分扎主链（如迁移未执行表不存在）")
      void initFromTask_failureDoesNotPropagate() {
          CuttingTask t = task("t-1");
          CuttingBom bom = new CuttingBom();
          bom.setMaterialCode("M-1");
          bom.setMaterialName("面料");
          bom.setUsageAmount(new BigDecimal("2"));
          when(cuttingTaskService.getById("t-1")).thenReturn(t);
          when(cuttingBomService.listByCuttingTaskId("t-1")).thenReturn(List.of(bom));
          when(usageService.listByCuttingTaskId("t-1")).thenReturn(Collections.emptyList());
          when(usageService.saveBatch(anyList())).thenThrow(new RuntimeException("Table 't_cutting_material_usage' doesn't exist"));

          // 不得抛异常（分扎生成不能被台账拖垮）
          orchestrator.initFromTask(t);
      }

      @Test
      @DisplayName("登记：实际=领出 → 无余料(NONE)；实际<领出 → 余料入账(PENDING)")
    void saveActual_computesRemnant() {
        when(cuttingTaskService.getById("t-1")).thenReturn(task("t-1"));
        when(usageService.listByCuttingTaskId("t-1"))
                .thenReturn(new ArrayList<>(List.of(usageRow("M-1", new BigDecimal("210")))));
        when(usageService.updateById(any())).thenReturn(true);

        Map<String, Object> row = new HashMap<>();
        row.put("materialCode", "M-1");
        row.put("issuedAmount", "210");
        row.put("actualUsed", "175");
        Map<String, Object> result = orchestrator.saveActual("t-1", List.of(row), "op1", "张三");

        assertThat((BigDecimal) result.get("remnantTotal")).isEqualByComparingTo("35");
        assertThat(String.valueOf(result.get("message"))).contains("余料 35");

        ArgumentCaptor<CuttingMaterialUsage> captor = ArgumentCaptor.forClass(CuttingMaterialUsage.class);
        verify(usageService).updateById(captor.capture());
        assertThat(captor.getValue().getRemnantAmount()).isEqualByComparingTo("35");
        assertThat(captor.getValue().getRemnantStatus()).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("登记：行内缺省 issued/actual 时按 计划=领出=实际 兜底（一键确认无余料）")
    void saveActual_defaultsIssueEqualsPlan_actualEqualsIssue() {
        when(cuttingTaskService.getById("t-1")).thenReturn(task("t-1"));
        when(usageService.listByCuttingTaskId("t-1"))
                .thenReturn(new ArrayList<>(List.of(usageRow("M-1", new BigDecimal("210")))));
        when(usageService.updateById(any())).thenReturn(true);

        Map<String, Object> row = new HashMap<>();
        row.put("materialCode", "M-1"); // 不传 issued/actual
        Map<String, Object> result = orchestrator.saveActual("t-1", List.of(row), "op1", "张三");

        assertThat((BigDecimal) result.get("remnantTotal")).isEqualByComparingTo("0");
        ArgumentCaptor<CuttingMaterialUsage> captor = ArgumentCaptor.forClass(CuttingMaterialUsage.class);
        verify(usageService).updateById(captor.capture());
        assertThat(captor.getValue().getIssuedAmount()).isEqualByComparingTo("210");
        assertThat(captor.getValue().getActualUsed()).isEqualByComparingTo("210");
        assertThat(captor.getValue().getRemnantStatus()).isEqualTo("NONE");
    }

    @Test
    @DisplayName("登记：实际消耗大于领出量必须抛错（防账面负余料）")
    void saveActual_rejectsActualExceedsIssued() {
        when(cuttingTaskService.getById("t-1")).thenReturn(task("t-1"));
        when(usageService.listByCuttingTaskId("t-1"))
                .thenReturn(new ArrayList<>(List.of(usageRow("M-1", new BigDecimal("210")))));

        Map<String, Object> row = new HashMap<>();
        row.put("materialCode", "M-1");
        row.put("issuedAmount", "100");
        row.put("actualUsed", "120");
        assertThatThrownBy(() -> orchestrator.saveActual("t-1", List.of(row), "op1", "张三"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("实际消耗不能大于领出量");
        verify(usageService, never()).updateById(any());
    }

    @Test
    @DisplayName("回库：走手动入库链路，状态置 INBOUNDED 并回写入库单号")
    void remnantInbound_full_inboundNoWrittenBack() {
        CuttingMaterialUsage row = usageRow("M-1", new BigDecimal("210"));
        row.setIssuedAmount(new BigDecimal("210"));
        row.setActualUsed(new BigDecimal("175"));
        row.setRemnantAmount(new BigDecimal("35"));
        row.setRemnantStatus("PENDING");
        when(cuttingTaskService.getById("t-1")).thenReturn(task("t-1"));
        when(usageService.listByCuttingTaskId("t-1"))
                .thenReturn(new ArrayList<>(List.of(row)));   // 回写汇总时返回同一行
        Map<String, Object> inboundResult = new HashMap<>();
        inboundResult.put("inboundNo", "RK20261019000001");
        when(materialInboundOrchestrator.manualInbound(eq("M-1"), eq("面料M-1"), eq("面料"),
                eq("黑色"), eq("150cm"), eq(new BigDecimal("35")), eq("默认仓"),
                eq(null), eq("op1"), eq("张三"), any())).thenReturn(inboundResult);
        when(usageService.updateById(any())).thenReturn(true);

        Map<String, Object> reqRow = new HashMap<>();
        reqRow.put("materialCode", "M-1");
        Map<String, Object> result = orchestrator.remnantInbound("t-1", List.of(reqRow), "op1", "张三");

        assertThat((BigDecimal) result.get("inboundTotal")).isEqualByComparingTo("35");
        assertThat((BigDecimal) result.get("remnantTotal")).isEqualByComparingTo("0");
        verify(materialInboundOrchestrator).manualInbound(eq("M-1"), eq("面料M-1"), eq("面料"),
                eq("黑色"), eq("150cm"), eq(new BigDecimal("35")), eq("默认仓"),
                eq(null), eq("op1"), eq("张三"), any());

        ArgumentCaptor<CuttingMaterialUsage> captor = ArgumentCaptor.forClass(CuttingMaterialUsage.class);
        verify(usageService).updateById(captor.capture());
        assertThat(captor.getValue().getRemnantStatus()).isEqualTo("INBOUNDED");
        assertThat(captor.getValue().getRemnantAmount()).isEqualByComparingTo("0");
        assertThat(captor.getValue().getRemnantInboundNo()).isEqualTo("RK20261019000001");
    }

    @Test
    @DisplayName("回库：支持部分回库——余料扣减后仍为 PENDING")
    void remnantInbound_partial_staysPending() {
        CuttingMaterialUsage row = usageRow("M-1", new BigDecimal("210"));
        row.setIssuedAmount(new BigDecimal("210"));
        row.setActualUsed(new BigDecimal("175"));
        row.setRemnantAmount(new BigDecimal("35"));
        row.setRemnantStatus("PENDING");
        when(cuttingTaskService.getById("t-1")).thenReturn(task("t-1"));
        when(usageService.listByCuttingTaskId("t-1"))
                .thenReturn(new ArrayList<>(List.of(row)));
        Map<String, Object> inboundResult = new HashMap<>();
        inboundResult.put("inboundNo", "RK20261019000002");
        when(materialInboundOrchestrator.manualInbound(any(), any(), any(), any(), any(),
                eq(new BigDecimal("20")), any(), any(), any(), any(), any())).thenReturn(inboundResult);
        when(usageService.updateById(any())).thenReturn(true);

        Map<String, Object> reqRow = new HashMap<>();
        reqRow.put("materialCode", "M-1");
        reqRow.put("quantity", "20"); // 只回 20 米
        Map<String, Object> result = orchestrator.remnantInbound("t-1", List.of(reqRow), "op1", "张三");

        ArgumentCaptor<CuttingMaterialUsage> captor = ArgumentCaptor.forClass(CuttingMaterialUsage.class);
        verify(usageService).updateById(captor.capture());
        assertThat(captor.getValue().getRemnantAmount()).isEqualByComparingTo("15");
        assertThat(captor.getValue().getRemnantStatus()).isEqualTo("PENDING");
        assertThat((BigDecimal) result.get("remnantTotal")).isEqualByComparingTo("15");
    }

    @Test
    @DisplayName("回库：回库数量大于余料量必须抛错")
    void remnantInbound_rejectsQuantityExceedsRemnant() {
        CuttingMaterialUsage row = usageRow("M-1", new BigDecimal("210"));
        row.setRemnantAmount(new BigDecimal("35"));
        row.setRemnantStatus("PENDING");
        when(cuttingTaskService.getById("t-1")).thenReturn(task("t-1"));
        when(usageService.listByCuttingTaskId("t-1"))
                .thenReturn(new ArrayList<>(List.of(row)));

        Map<String, Object> reqRow = new HashMap<>();
        reqRow.put("materialCode", "M-1");
        reqRow.put("quantity", "50");
        assertThatThrownBy(() -> orchestrator.remnantInbound("t-1", List.of(reqRow), "op1", "张三"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("回库数量不能大于余料量");
        verify(materialInboundOrchestrator, never()).manualInbound(any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any());
    }
}
