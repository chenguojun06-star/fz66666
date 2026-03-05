package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.MaterialStockAlertDto;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialPickingItemMapper;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.style.service.StyleBomService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MaterialStockOrchestratorTest {

    @Mock
    private MaterialStockService materialStockService;

    @Mock
    private MaterialPickingItemMapper materialPickingItemMapper;

    @Mock
    private StyleBomService styleBomService;

    @InjectMocks
    private MaterialStockOrchestrator materialStockOrchestrator;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        UserContext.set(ctx);
    }

    @Test
    void listAlerts_withNoStock_returnsEmptyList() {
        when(materialStockService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        List<MaterialStockAlertDto> result = materialStockOrchestrator.listAlerts(new HashMap<>());

        assertThat(result).isEmpty();
    }

    @Test
    void listAlerts_withNullParams_handledSafely() {
        when(materialStockService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        List<MaterialStockAlertDto> result = materialStockOrchestrator.listAlerts(null);

        assertThat(result).isNotNull().isEmpty();
    }

    @Test
    void listAlerts_withNullStockList_returnsEmptyList() {
        when(materialStockService.list(any(Wrapper.class))).thenReturn(null);

        List<MaterialStockAlertDto> result = materialStockOrchestrator.listAlerts(new HashMap<>());

        assertThat(result).isEmpty();
    }

    @Test
    void listAlerts_withOneStock_returnsOneDto() {
        MaterialStock stock = new MaterialStock();
        stock.setId("s1");
        stock.setMaterialId("m1");
        stock.setMaterialCode("CODE001");
        stock.setMaterialName("面料A");
        stock.setMaterialType("面料");
        stock.setUnit("米");
        stock.setQuantity(100);
        stock.setSafetyStock(20);

        when(materialStockService.list(any(Wrapper.class))).thenReturn(List.of(stock));
        when(materialPickingItemMapper.selectList(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(styleBomService.listByMaterialCodes(any())).thenReturn(Collections.emptyList());

        List<MaterialStockAlertDto> result = materialStockOrchestrator.listAlerts(new HashMap<>());

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getMaterialCode()).isEqualTo("CODE001");
        assertThat(result.get(0).getQuantity()).isEqualTo(100);
    }

    @Test
    void listAlerts_withOnlyNeedTrue_filtersOutSufficientStock() {
        // stock with quantity=1000 >> safetyStock=10 => needReplenish=false => filtered
        MaterialStock stock = new MaterialStock();
        stock.setId("s1");
        stock.setMaterialId("m1");
        stock.setMaterialCode("CODE001");
        stock.setQuantity(1000);
        stock.setSafetyStock(10);

        when(materialStockService.list(any(Wrapper.class))).thenReturn(List.of(stock));
        when(materialPickingItemMapper.selectList(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(styleBomService.listByMaterialCodes(any())).thenReturn(Collections.emptyList());

        Map<String, Object> params = new HashMap<>();
        params.put("onlyNeed", "true");

        List<MaterialStockAlertDto> result = materialStockOrchestrator.listAlerts(params);

        assertThat(result).isEmpty();
    }

    @Test
    void listAlerts_withLimitParam_limitsTotalResults() {
        MaterialStock s1 = new MaterialStock();
        s1.setId("s1");
        s1.setMaterialId("m1");
        s1.setMaterialCode("A");
        s1.setQuantity(5);
        s1.setSafetyStock(100); // need replenish

        MaterialStock s2 = new MaterialStock();
        s2.setId("s2");
        s2.setMaterialId("m2");
        s2.setMaterialCode("B");
        s2.setQuantity(5);
        s2.setSafetyStock(100); // need replenish

        when(materialStockService.list(any(Wrapper.class))).thenReturn(List.of(s1, s2));
        when(materialPickingItemMapper.selectList(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(styleBomService.listByMaterialCodes(any())).thenReturn(Collections.emptyList());

        Map<String, Object> params = new HashMap<>();
        params.put("limit", "1");

        List<MaterialStockAlertDto> result = materialStockOrchestrator.listAlerts(params);

        assertThat(result).hasSize(1);
    }

    @Test
    void listAlerts_needReplenishFlagSet_whenQuantityBelowSuggestedSafety() {
        MaterialStock stock = new MaterialStock();
        stock.setId("s1");
        stock.setMaterialId("m1");
        stock.setMaterialCode("X");
        stock.setQuantity(10);       // low
        stock.setSafetyStock(500);   // high => need=true

        when(materialStockService.list(any(Wrapper.class))).thenReturn(List.of(stock));
        when(materialPickingItemMapper.selectList(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(styleBomService.listByMaterialCodes(any())).thenReturn(Collections.emptyList());

        List<MaterialStockAlertDto> result = materialStockOrchestrator.listAlerts(new HashMap<>());

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getNeedReplenish()).isTrue();
    }
}
