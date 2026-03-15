package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FinishedInventoryOrchestratorTest {

    @InjectMocks
    private FinishedInventoryOrchestrator orchestrator;

    @Mock
    private ProductSkuService productSkuService;
    @Mock
    private ProductWarehousingMapper productWarehousingMapper;
    @Mock
    private ProductOutstockService productOutstockService;
    @Mock
    private ProductionOrderService productionOrderService;
    @Mock
    private StyleInfoService styleInfoService;
    @Mock
    private StyleAttachmentService styleAttachmentService;
    @Mock
    private EcommerceOrderOrchestrator ecommerceOrderOrchestrator;

    @Test
    @SuppressWarnings("unchecked")
    void getFinishedInventoryPage_withValidParams_returnsPage() {
        when(productSkuService.page(any(), any())).thenReturn(new Page<ProductSku>());
        Map<String, Object> params = new HashMap<>();
        params.put("page", "1");
        params.put("pageSize", "10");
        var result = orchestrator.getFinishedInventoryPage(params);
        assertThat(result).isNotNull();
        assertThat(result.getRecords()).isEmpty();
    }

    @Test
    void outbound_withNullItems_throwsIllegalArgument() {
        Map<String, Object> params = new HashMap<>();
        // no "items" key → items is null
        assertThatThrownBy(() -> orchestrator.outbound(params))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void outbound_withEmptyItems_throwsIllegalArgument() {
        Map<String, Object> params = new HashMap<>();
        params.put("items", List.of());
        assertThatThrownBy(() -> orchestrator.outbound(params))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void outbound_withItemMissingSkuCode_throwsIllegalArgument() {
        Map<String, Object> params = new HashMap<>();
        Map<String, Object> item = new HashMap<>();
        item.put("sku", "");  // blank SKU
        item.put("quantity", "5");
        params.put("items", List.of(item));
        assertThatThrownBy(() -> orchestrator.outbound(params))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void outbound_withValidItem_decrementsStockAndWritesOutstock() {
        ProductSku sku = new ProductSku();
        sku.setId(1L);
        sku.setStyleId(100L);
        sku.setStyleNo("ST001");
        sku.setSkuCode("ST001-黑色-M");
        sku.setStockQuantity(18);

        StyleInfo styleInfo = new StyleInfo();
        styleInfo.setId(100L);
        styleInfo.setStyleNo("ST001");
        styleInfo.setStyleName("测试款");
        styleInfo.setOrderNo("PO001");

        when(productSkuService.getOne(any())).thenReturn(sku);
        when(styleInfoService.getById(100L)).thenReturn(styleInfo);
        when(productOutstockService.save(any(ProductOutstock.class))).thenReturn(true);

        Map<String, Object> item = new HashMap<>();
        item.put("sku", "ST001-黑色-M");
        item.put("quantity", 5);

        Map<String, Object> params = new HashMap<>();
        params.put("items", List.of(item));
        params.put("orderId", "order-1");
        params.put("orderNo", "PO001");
        params.put("warehouseLocation", "A仓");

        orchestrator.outbound(params);

        assertThat(sku.getStockQuantity()).isEqualTo(13);
        verify(productSkuService).updateById(argThat(updated -> updated.getStockQuantity() == 13));
        verify(productOutstockService).save(argThat(outstock ->
                "order-1".equals(outstock.getOrderId())
                        && "PO001".equals(outstock.getOrderNo())
                        && "ST001".equals(outstock.getStyleNo())
                        && Integer.valueOf(5).equals(outstock.getOutstockQuantity())
                        && "A仓".equals(outstock.getWarehouse())
                        && outstock.getRemark() != null
                        && outstock.getRemark().contains("sku=ST001-黑色-M")
        ));
    }

    @Test
    @SuppressWarnings("unchecked")
    void getFinishedInventoryPage_enrichesLatestOutboundInfo() {
        ProductSku sku = new ProductSku();
        sku.setId(1L);
        sku.setStyleId(100L);
        sku.setStyleNo("ST001");
        sku.setColor("黑色");
        sku.setSize("M");
        sku.setSkuCode("ST001-黑色-M");
        sku.setStockQuantity(18);

        Page<ProductSku> page = new Page<>();
        page.setRecords(List.of(sku));

        StyleInfo styleInfo = new StyleInfo();
        styleInfo.setId(100L);
        styleInfo.setStyleNo("ST001");
        styleInfo.setStyleName("测试款");

        ProductOutstock outstock = new ProductOutstock();
        outstock.setStyleId("100");
        outstock.setStyleNo("ST001");
        outstock.setOutstockNo("FI202603150001");
        outstock.setOperatorName("仓管A");
        outstock.setCreateTime(LocalDateTime.of(2026, 3, 15, 10, 30));

        when(productSkuService.page(any(), any())).thenReturn(page);
        when(styleInfoService.listByIds(any())).thenReturn(List.of(styleInfo));
        when(productWarehousingMapper.selectList(any())).thenReturn(List.of());
        when(productOutstockService.list(org.mockito.ArgumentMatchers.<com.baomidou.mybatisplus.core.conditions.Wrapper<ProductOutstock>>any()))
            .thenReturn(List.of(outstock), List.of(outstock));

        Map<String, Object> params = new HashMap<>();
        params.put("page", "1");
        params.put("pageSize", "10");

        var result = orchestrator.getFinishedInventoryPage(params);

        assertThat(result.getRecords()).hasSize(1);
        assertThat(result.getRecords().get(0).getLastOutstockNo()).isEqualTo("FI202603150001");
        assertThat(result.getRecords().get(0).getLastOutboundBy()).isEqualTo("仓管A");
        assertThat(result.getRecords().get(0).getLastOutboundDate())
                .isEqualTo(LocalDateTime.of(2026, 3, 15, 10, 30));
    }
}
