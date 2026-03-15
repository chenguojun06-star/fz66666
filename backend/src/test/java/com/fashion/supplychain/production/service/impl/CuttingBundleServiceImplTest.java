package com.fashion.supplychain.production.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.QrCodeSigner;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class CuttingBundleServiceImplTest {

    @Spy
    @InjectMocks
    private CuttingBundleServiceImpl service;

    @Mock
    private CuttingBundleMapper cuttingBundleMapper;

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private CuttingTaskService cuttingTaskService;

    @Mock
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @Mock
    private QrCodeSigner qrCodeSigner;

    @BeforeEach
    void setUp() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, CuttingBundle.class);

        ReflectionTestUtils.setField(service, "baseMapper", cuttingBundleMapper);

        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUserId("operator1");
        ctx.setUsername("操作员");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    @DisplayName("generateBundles - 已领取任务可正常生成菲号并推进 bundled 链路")
    void generateBundles_receivedTask_generatesBundlesAndUpdatesFlow() {
        ProductionOrder order = new ProductionOrder();
        order.setId("order-1");
        order.setOrderNo("CUT-ORDER-001");
        order.setStyleId("style-1");
        order.setStyleNo("TPL-001");
        order.setMaterialArrivalRate(100);

        CuttingTask task = new CuttingTask();
        task.setId("task-1");
        task.setProductionOrderId("order-1");
        task.setStatus("received");

        CuttingBundle lastBundle = new CuttingBundle();
        lastBundle.setBedNo(7);

        when(productionOrderService.getById("order-1")).thenReturn(order);
        when(cuttingTaskService.createTaskIfAbsent(order)).thenReturn(task);
        when(cuttingBundleMapper.selectOne(any())).thenReturn(null, lastBundle);
        when(qrCodeSigner.sign(any())).thenAnswer(inv -> "SIGNED-" + inv.getArgument(0));
        doReturn(0L).when(service).count(any());
        doReturn(true).when(service).saveBatch(any());

        List<CuttingBundle> result = service.generateBundles("order-1", List.of(
                Map.of("color", "红色", "size", "L", "quantity", 20),
                Map.of("color", "红色", "size", "XL", "quantity", 30)));

        assertThat(result).hasSize(2);
        assertThat(result.get(0).getProductionOrderId()).isEqualTo("order-1");
        assertThat(result.get(0).getStyleNo()).isEqualTo("TPL-001");
        assertThat(result.get(0).getBundleNo()).isEqualTo(1);
        assertThat(result.get(1).getBundleNo()).isEqualTo(2);
        assertThat(result.get(0).getBedNo()).isEqualTo(8);
        assertThat(result.get(1).getBedNo()).isEqualTo(8);
        assertThat(result.get(0).getQrCode()).contains("SIGNED-");

        verify(cuttingTaskService).markBundledByOrderId("order-1");
        verify(processTrackingOrchestrator).initializeProcessTracking("order-1");
        verify(productionOrderService).updateById(order);
        verify(productionOrderService).recomputeProgressFromRecords("order-1");
        assertThat(order.getCurrentProcessName()).isEqualTo("车缝");
        assertThat(order.getCuttingBundleCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("generateBundles - 未领取任务禁止直接生成菲号")
    void generateBundles_pendingTask_throwsIllegalState() {
        ProductionOrder order = new ProductionOrder();
        order.setId("order-1");
        order.setOrderNo("CUT-ORDER-001");
        order.setStyleNo("TPL-001");
        order.setMaterialArrivalRate(100);

        CuttingTask task = new CuttingTask();
        task.setId("task-1");
        task.setProductionOrderId("order-1");
        task.setStatus("pending");

        when(productionOrderService.getById("order-1")).thenReturn(order);
        when(cuttingTaskService.createTaskIfAbsent(order)).thenReturn(task);

        assertThatThrownBy(() -> service.generateBundles("order-1", List.of(
                Map.of("color", "红色", "size", "L", "quantity", 20))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("请先在裁剪任务中领取后再生成裁剪单");
    }
}
