package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.helper.CuttingWorkflowBuilderHelper;
import com.fashion.supplychain.production.helper.OrderRemarkHelper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.Map;
import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ProductionOrderCreationHelper - 生产订单创建辅助")
class ProductionOrderCreationHelperTest {

    @Mock
    private ProductionOrderService productionOrderService;
    @Mock
    private MaterialPurchaseService materialPurchaseService;
    @Mock
    private ProductionOrderScanRecordDomainService scanRecordDomainService;
    @Mock
    private ProductionOrderOrchestratorHelper helper;
    @Mock
    private StyleInfoService styleInfoService;
    @Mock
    private CuttingWorkflowBuilderHelper cuttingWorkflowBuilderHelper;
    @Mock
    private OrderRemarkHelper orderRemarkHelper;

    @InjectMocks
    private ProductionOrderCreationHelper creationHelper;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setUserId("user-001");
        ctx.setUsername("跟单员A");
        ctx.setTenantId(1L);
        ctx.setRole("admin");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Nested
    @DisplayName("saveOrUpdateOrder - 保存/更新订单")
    class SaveOrUpdateOrder {

        @Test
        @DisplayName("null参数-抛异常")
        void nullParam_throwsException() {
            assertThatThrownBy(() -> creationHelper.saveOrUpdateOrder(null))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("参数错误");
        }

        @Test
        @DisplayName("更新时订单不存在-抛异常")
        void updateNonExistent_throwsException() {
            ProductionOrder order = new ProductionOrder();
            order.setId("non-existent-id");
            order.setOperationRemark("修改备注");
            when(productionOrderService.getById("non-existent-id")).thenReturn(null);

            assertThatThrownBy(() -> creationHelper.saveOrUpdateOrder(order))
                    .isInstanceOf(NoSuchElementException.class)
                    .hasMessageContaining("生产订单不存在");
        }

        @Test
        @DisplayName("更新时订单已删除-抛异常")
        void updateDeletedOrder_throwsException() {
            ProductionOrder order = new ProductionOrder();
            order.setId("deleted-id");
            order.setOperationRemark("修改备注");
            ProductionOrder existed = new ProductionOrder();
            existed.setId("deleted-id");
            existed.setDeleteFlag(1);
            existed.setTenantId(1L);
            when(productionOrderService.getById("deleted-id")).thenReturn(existed);

            assertThatThrownBy(() -> creationHelper.saveOrUpdateOrder(order))
                    .isInstanceOf(NoSuchElementException.class)
                    .hasMessageContaining("生产订单不存在");
        }

        @Test
        @DisplayName("更新时订单已终态-抛异常")
        void updateTerminalOrder_throwsException() {
            ProductionOrder order = new ProductionOrder();
            order.setId("closed-id");
            order.setOperationRemark("修改备注");
            ProductionOrder existed = new ProductionOrder();
            existed.setId("closed-id");
            existed.setStatus("closed");
            existed.setDeleteFlag(0);
            existed.setTenantId(1L);
            when(productionOrderService.getById("closed-id")).thenReturn(existed);
            when(helper.safeText("closed")).thenReturn("closed");

            assertThatThrownBy(() -> creationHelper.saveOrUpdateOrder(order))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("订单已终态");
        }

        @Test
        @DisplayName("更新时未填写操作备注-抛异常")
        void updateWithoutRemark_throwsException() {
            ProductionOrder order = new ProductionOrder();
            order.setId("order-001");
            ProductionOrder existed = new ProductionOrder();
            existed.setId("order-001");
            existed.setStatus("pending");
            existed.setDeleteFlag(0);
            existed.setTenantId(1L);
            when(productionOrderService.getById("order-001")).thenReturn(existed);
            when(helper.safeText("pending")).thenReturn("pending");

            assertThatThrownBy(() -> creationHelper.saveOrUpdateOrder(order))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("操作备注");
        }

        @Test
        @DisplayName("创建订单-成功")
        void createOrder_success() {
            ProductionOrder order = new ProductionOrder();
            order.setStyleNo("S-001");
            when(productionOrderService.saveOrUpdateOrder(any())).thenReturn(true);
            when(productionOrderService.getById(any())).thenReturn(order);

            boolean result = creationHelper.saveOrUpdateOrder(order);
            assertThat(result).isTrue();
            verify(productionOrderService).saveOrUpdateOrder(any());
        }
    }

    @Nested
    @DisplayName("createOrderFromStyle - 从样衣创建订单")
    class CreateOrderFromStyle {

        @Test
        @DisplayName("styleId为空-抛异常")
        void emptyStyleId_throwsException() {
            assertThatThrownBy(() -> creationHelper.createOrderFromStyle("", "MONTHLY", null))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("样衣ID不能为空");
        }

        @Test
        @DisplayName("priceType为空-抛异常")
        void emptyPriceType_throwsException() {
            assertThatThrownBy(() -> creationHelper.createOrderFromStyle("1", "", null))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("单价类型不能为空");
        }

        @Test
        @DisplayName("样衣不存在-抛异常")
        void styleNotFound_throwsException() {
            when(styleInfoService.getDetailById(1L)).thenReturn(null);
            assertThatThrownBy(() -> creationHelper.createOrderFromStyle("1", "MONTHLY", null))
                    .isInstanceOf(NoSuchElementException.class)
                    .hasMessageContaining("样衣信息不存在");
        }

        @Test
        @DisplayName("样衣开发未完成-抛异常")
        void styleNotComplete_throwsException() {
            StyleInfo style = new StyleInfo();
            style.setId(1L);
            style.setProgressNode("打版中");
            style.setStyleNo("S-001");
            style.setStyleName("测试款式");
            when(styleInfoService.getDetailById(1L)).thenReturn(style);

            assertThatThrownBy(() -> creationHelper.createOrderFromStyle("1", "MONTHLY", null))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("样衣开发未完成");
        }

        @Test
        @DisplayName("正常创建-成功")
        void normalCreate_success() {
            StyleInfo style = new StyleInfo();
            style.setId(1L);
            style.setProgressNode("样衣完成");
            style.setStyleNo("S-001");
            style.setStyleName("测试款式");
            style.setSkc("SKC001");
            when(styleInfoService.getDetailById(1L)).thenReturn(style);
            when(productionOrderService.save(any(ProductionOrder.class))).thenAnswer(invocation -> {
                ProductionOrder o = invocation.getArgument(0);
                o.setId("new-order-id");
                o.setOrderNo("ON-20260508-001");
                return true;
            });

            Map<String, Object> result = creationHelper.createOrderFromStyle("1", "MONTHLY", "备注");
            assertThat(result).containsEntry("styleNo", "S-001");
            assertThat(result).containsEntry("styleName", "测试款式");
            assertThat(result).containsKey("id");
            assertThat(result).containsKey("orderNo");
        }

        @Test
        @DisplayName("样衣progressNode为null-视为未完成")
        void nullProgressNode_throwsException() {
            StyleInfo style = new StyleInfo();
            style.setId(1L);
            style.setProgressNode(null);
            style.setStyleNo("S-001");
            when(styleInfoService.getDetailById(1L)).thenReturn(style);

            assertThatThrownBy(() -> creationHelper.createOrderFromStyle("1", "MONTHLY", null))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("样衣开发未完成");
        }
    }
}
