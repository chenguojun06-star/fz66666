package com.fashion.supplychain.style.orchestration;

import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.mapper.ProductSkuMapper;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * D-841：SKU 库存调整入口的单测。
 *
 * <p>背景（2026-10-23 生产事故排查）：一批 SKU 库存被批量改写，操作日志与库存流水
 * 均为空，无法追溯。updateStock 是库存改动单点入口，本测试守护：
 * ① SKU 不存在必须拒绝（不静默改建）；
 * ② 正常路径必须按增量透传 Service（记账日志不阻断主流程）。
 */
@MockitoSettings(strictness = Strictness.LENIENT)
class ProductSkuOrchestratorTest {

    @Mock
    private ProductSkuService productSkuService;
    @Mock
    private StyleInfoMapper styleInfoMapper;
    @Mock
    private ProductionOrderMapper productionOrderMapper;
    @Mock
    private StyleInfoService styleInfoService;
    @Mock
    private ProductSkuMapper productSkuMapper;
    @Mock
    private ProductWarehousingService productWarehousingService;
    @Mock
    private LambdaQueryChainWrapper<ProductSku> skuQueryChain;
    @Mock
    private com.fashion.supplychain.warehouse.service.StockChangeLogService stockChangeLogService;

    @InjectMocks
    private ProductSkuOrchestrator orchestrator;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        when(productSkuService.lambdaQuery()).thenReturn(skuQueryChain);
        when(skuQueryChain.eq(any(), any())).thenReturn(skuQueryChain);
    }

    @AfterEach
    void tearDown() throws Exception {
        mocks.close();
    }

    @Test
    @DisplayName("D-849 期望库存口径：合格入库-出库（次品不参与，下限 0）")
    void computeExpectedStock_deductsOutstock() {
        // 入库 300、出库 300 → 0（BR24XQ0098E 真实场景：原实现只算入库会刷回 300）
        org.assertj.core.api.Assertions.assertThat(
                ProductSkuOrchestrator.computeExpectedStock(300, 300)).isEqualTo(0);
        // 入库 100、出库 10 → 90（次品不进库存，不参与计算）
        org.assertj.core.api.Assertions.assertThat(
                ProductSkuOrchestrator.computeExpectedStock(100, 10)).isEqualTo(90);
        // 出库超过入库 → 下限 0，不出负数
        org.assertj.core.api.Assertions.assertThat(
                ProductSkuOrchestrator.computeExpectedStock(10, 15)).isEqualTo(0);
    }

    @Test
    @DisplayName("库存调整：SKU 不存在必须拒绝，不得静默改建")
    void updateStock_rejectsMissingSku() {
        try (var mocked = mockStatic(UserContext.class)) {
            mocked.when(UserContext::tenantId).thenReturn(2L);
            when(skuQueryChain.one()).thenReturn(null);

            assertThatThrownBy(() -> orchestrator.updateStock("NOPE-黑-M", 5))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("SKU不存在");
        }
    }

    @Test
    @DisplayName("库存调整：正常路径按增量更新，且记账不阻断主流程")
    void updateStock_appliesDelta() {
        try (var mocked = mockStatic(UserContext.class)) {
            mocked.when(UserContext::tenantId).thenReturn(2L);
            ProductSku sku = new ProductSku();
            sku.setSkuCode("BR26X1Q1011A-墨绿-M");
            sku.setStyleNo("BR26X1Q1011A");
            sku.setStockQuantity(100);
            when(skuQueryChain.one()).thenReturn(sku);

            orchestrator.updateStock("BR26X1Q1011A-墨绿-M", -3);

            // 增量语义：-3 必须透传到 Service（100 → 97）
            verify(productSkuService).updateStock("BR26X1Q1011A-墨绿-M", -3);

            // D-845：手工调整必须写库存流水（此前只有入库/出库写，调整是盲区）
            org.mockito.ArgumentCaptor<com.fashion.supplychain.warehouse.entity.StockChangeLog> cap =
                    org.mockito.ArgumentCaptor.forClass(com.fashion.supplychain.warehouse.entity.StockChangeLog.class);
            verify(stockChangeLogService).save(cap.capture());
            com.fashion.supplychain.warehouse.entity.StockChangeLog scl = cap.getValue();
            org.assertj.core.api.Assertions.assertThat(scl.getChangeType()).isEqualTo("ADJUST");
            org.assertj.core.api.Assertions.assertThat(scl.getBeforeQuantity()).isEqualByComparingTo("100");
            org.assertj.core.api.Assertions.assertThat(scl.getChangeQuantity()).isEqualByComparingTo("-3");
            org.assertj.core.api.Assertions.assertThat(scl.getAfterQuantity()).isEqualByComparingTo("97");
            org.assertj.core.api.Assertions.assertThat(scl.getBizType()).isEqualTo("manual_adjust");
        }
    }
}
