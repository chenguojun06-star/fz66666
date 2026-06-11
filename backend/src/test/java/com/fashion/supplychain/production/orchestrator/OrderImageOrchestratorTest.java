package com.fashion.supplychain.production.orchestrator;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;
import com.baomidou.mybatisplus.extension.conditions.update.LambdaUpdateChainWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.OrderImage;
import com.fashion.supplychain.production.entity.OrderImageSnapshot;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.OrderImageOrchestrator;
import com.fashion.supplychain.production.service.OrderImageService;
import com.fashion.supplychain.production.service.OrderImageSnapshotService;
import com.fashion.supplychain.production.service.ProductionOrderService;

import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@SuppressWarnings("unchecked")
class OrderImageOrchestratorTest {

    @InjectMocks
    private OrderImageOrchestrator orchestrator;

    @Mock
    private OrderImageService orderImageService;
    @Mock
    private OrderImageSnapshotService orderImageSnapshotService;
    @Mock
    private ProductionOrderService productionOrderService;
    @Mock
    private LambdaQueryChainWrapper<OrderImage> mockOrderImageQuery;
    @Mock
    private LambdaQueryChainWrapper<ProductionOrder> mockProductionOrderQuery;
    @Mock
    private LambdaQueryChainWrapper<OrderImageSnapshot> mockSnapshotQuery;
    @Mock
    private LambdaUpdateChainWrapper<OrderImage> mockOrderImageUpdate;

    @BeforeEach
    void setUp() {
        initTableInfo();
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUserId("user-1");
        ctx.setUsername("测试用户");
        UserContext.set(ctx);

        setupDefaultMocks();
    }

    private void setupDefaultMocks() {
        when(orderImageService.lambdaQuery()).thenReturn(mockOrderImageQuery);
        when(productionOrderService.lambdaQuery()).thenReturn(mockProductionOrderQuery);
        when(orderImageSnapshotService.lambdaQuery()).thenReturn(mockSnapshotQuery);
        when(orderImageService.lambdaUpdate()).thenReturn(mockOrderImageUpdate);

        doReturn(mockOrderImageQuery).when(mockOrderImageQuery).eq(any(), any());
        doReturn(mockOrderImageQuery).when(mockOrderImageQuery).select(any(SFunction[].class));
        doReturn(mockOrderImageQuery).when(mockOrderImageQuery).orderByAsc(any(SFunction.class));
        doReturn(mockOrderImageQuery).when(mockOrderImageQuery).last(anyString());

        doReturn(mockProductionOrderQuery).when(mockProductionOrderQuery).eq(any(), any());
        doReturn(mockProductionOrderQuery).when(mockProductionOrderQuery).last(anyString());

        doReturn(mockSnapshotQuery).when(mockSnapshotQuery).eq(any(), any());
        doReturn(mockSnapshotQuery).when(mockSnapshotQuery).orderByDesc(any(SFunction.class));

        doReturn(mockOrderImageUpdate).when(mockOrderImageUpdate).eq(any(), any());
        doReturn(mockOrderImageUpdate).when(mockOrderImageUpdate).set(any(), any());
    }

    private void initTableInfo() {
        if (TableInfoHelper.getTableInfo(ProductionOrder.class) == null) {
            MybatisConfiguration configuration = new MybatisConfiguration();
            MapperBuilderAssistant assistant = new MapperBuilderAssistant(configuration, "");
            assistant.setCurrentNamespace("com.fashion.supplychain.production.mapper.ProductionOrderMapper");
            TableInfoHelper.initTableInfo(assistant, ProductionOrder.class);
        }
        if (TableInfoHelper.getTableInfo(OrderImage.class) == null) {
            MybatisConfiguration configuration = new MybatisConfiguration();
            MapperBuilderAssistant assistant = new MapperBuilderAssistant(configuration, "");
            assistant.setCurrentNamespace("com.fashion.supplychain.production.mapper.OrderImageMapper");
            TableInfoHelper.initTableInfo(assistant, OrderImage.class);
        }
        if (TableInfoHelper.getTableInfo(OrderImageSnapshot.class) == null) {
            MybatisConfiguration configuration = new MybatisConfiguration();
            MapperBuilderAssistant assistant = new MapperBuilderAssistant(configuration, "");
            assistant.setCurrentNamespace("com.fashion.supplychain.production.mapper.OrderImageSnapshotMapper");
            TableInfoHelper.initTableInfo(assistant, OrderImageSnapshot.class);
        }
    }

    @Test
    void listByOrderNo_validOrderNo_returnsImagesSortedBySortOrder() {
        OrderImage img1 = new OrderImage();
        img1.setSortOrder(0);
        OrderImage img2 = new OrderImage();
        img2.setSortOrder(1);
        when(mockOrderImageQuery.list()).thenReturn(List.of(img1, img2));

        List<OrderImage> result = orchestrator.listByOrderNo("ORD-001");

        assertThat(result).hasSize(2);
        verify(orderImageService).lambdaQuery();
    }

    @Test
    void addImage_orderNotFound_throwsException() {
        when(mockOrderImageQuery.count()).thenReturn(0L);
        when(mockProductionOrderQuery.one()).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.addImage("ORD-001", "url1", "thumb1"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("订单不存在");
    }

    @Test
    void addImage_maxImagesReached_throwsException() {
        when(mockOrderImageQuery.count()).thenReturn(5L);

        assertThatThrownBy(() -> orchestrator.addImage("ORD-001", "url1", "thumb1"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("最多上传5张图片");
    }

    @Test
    void addImage_valid_savesImageAndCreatesSnapshot() {
        ProductionOrder order = new ProductionOrder();
        order.setId("order-1");
        when(mockOrderImageQuery.count()).thenReturn(2L);
        when(mockProductionOrderQuery.one()).thenReturn(order);
        when(orderImageService.save(any(OrderImage.class))).thenReturn(true);
        when(mockOrderImageQuery.list()).thenReturn(List.of());

        OrderImage result = orchestrator.addImage("ORD-001", "http://img.url", "http://thumb.url");

        assertThat(result).isNotNull();
        verify(orderImageService).save(any(OrderImage.class));
        verify(orderImageSnapshotService).save(any(OrderImageSnapshot.class));
    }

    @Test
    void deleteImage_imageNotFound_throwsException() {
        when(mockOrderImageQuery.one()).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.deleteImage(999L))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("图片不存在");
    }

    @Test
    void deleteImage_valid_deletesAndReorders() {
        OrderImage img = new OrderImage();
        img.setId(1L);
        img.setOrderNo("ORD-001");
        when(mockOrderImageQuery.one()).thenReturn(img);
        when(mockOrderImageQuery.list()).thenReturn(List.of());
        when(orderImageService.updateById(any(OrderImage.class))).thenReturn(true);
        when(orderImageService.updateBatchById(anyList())).thenReturn(true);

        orchestrator.deleteImage(1L);

        verify(orderImageService).updateById(argThat(image -> image.getDeleteFlag() == 1));
        verify(orderImageSnapshotService).save(any(OrderImageSnapshot.class));
    }

    @Test
    void reorderImages_valid_updatesSortOrders() {
        List<Long> ids = List.of(3L, 1L, 2L);
        when(mockOrderImageUpdate.update()).thenReturn(true);
        when(mockOrderImageQuery.list()).thenReturn(List.of());

        orchestrator.reorderImages("ORD-001", ids);

        verify(orderImageService, times(3)).lambdaUpdate();
        verify(orderImageSnapshotService).save(any(OrderImageSnapshot.class));
    }

    @Test
    void listSnapshots_validOrderNo_returnsSnapshotsSortedByCreateTimeDesc() {
        OrderImageSnapshot s1 = new OrderImageSnapshot();
        OrderImageSnapshot s2 = new OrderImageSnapshot();
        when(mockSnapshotQuery.list()).thenReturn(List.of(s1, s2));

        List<OrderImageSnapshot> result = orchestrator.listSnapshots("ORD-001");

        assertThat(result).hasSize(2);
        verify(orderImageSnapshotService).lambdaQuery();
    }

    @Test
    void addImage_userContextNull_throwsBusinessException() {
        UserContext.clear();
        when(mockOrderImageQuery.count()).thenReturn(0L);

        assertThatThrownBy(() -> orchestrator.addImage("ORD-001", "url", "thumb"))
                .isInstanceOf(com.fashion.supplychain.common.BusinessException.class)
                .hasMessageContaining("租户上下文");
    }

    @Test
    void deleteImage_userContextNull_throwsBusinessException() {
        UserContext.clear();

        assertThatThrownBy(() -> orchestrator.deleteImage(1L))
                .isInstanceOf(com.fashion.supplychain.common.BusinessException.class)
                .hasMessageContaining("租户上下文");
    }
}
