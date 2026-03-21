package com.fashion.supplychain.dashboard.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.service.RedisService;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class DashboardQueryServiceImplTest {

    @Mock
    private StyleInfoService styleInfoService;
    @Mock
    private ProductionOrderService productionOrderService;
    @Mock
    private CuttingTaskService cuttingTaskService;
    @Mock
    private MaterialReconciliationService materialReconciliationService;
    @Mock
    private ShipmentReconciliationService shipmentReconciliationService;
    @Mock
    private ScanRecordService scanRecordService;
    @Mock
    private MaterialPurchaseService materialPurchaseService;
    @Mock
    private ProductWarehousingService productWarehousingService;
    @Mock
    private ProductionOrderMapper productionOrderMapper;
    @Mock
    private ProductWarehousingMapper productWarehousingMapper;
    @Mock
    private ProductOutstockService productOutstockService;
    @Mock
    private RedisService redisService;

    private DashboardQueryServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new DashboardQueryServiceImpl(
                styleInfoService,
                productionOrderService,
                cuttingTaskService,
                materialReconciliationService,
                shipmentReconciliationService,
                scanRecordService,
                materialPurchaseService,
                productWarehousingService,
                productionOrderMapper,
                productWarehousingMapper,
                productOutstockService,
                redisService);
    }

    @Test
    void sumOrderQuantityBetween_usesAggregateQuery() {
        when(productionOrderMapper.selectMaps(any())).thenReturn(List.of(Map.of("total", 321L)));

        long result = service.sumOrderQuantityBetween(LocalDateTime.now().minusDays(1), LocalDateTime.now());

        assertThat(result).isEqualTo(321L);
        verify(productionOrderMapper).selectMaps(any());
        verify(productionOrderService, never()).lambdaQuery();
    }

    @Test
    void sumWarehousingQuantityBetween_usesAggregateQuery() {
        when(productWarehousingMapper.selectMaps(any())).thenReturn(List.of(Map.of("TOTAL", 88L)));

        long result = service.sumWarehousingQuantityBetween(LocalDateTime.now().minusDays(1), LocalDateTime.now());

        assertThat(result).isEqualTo(88L);
        verify(productWarehousingMapper).selectMaps(any());
        verify(productWarehousingService, never()).lambdaQuery();
    }
}
