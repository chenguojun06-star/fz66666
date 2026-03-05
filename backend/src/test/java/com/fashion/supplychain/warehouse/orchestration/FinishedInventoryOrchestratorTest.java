package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
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
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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
}
