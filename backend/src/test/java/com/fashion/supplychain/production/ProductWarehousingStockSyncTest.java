package com.fashion.supplychain.production;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.orchestration.ProductWarehousingOrchestrator;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.impl.ProductWarehousingServiceImpl;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Collections;
import java.util.List;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class ProductWarehousingStockSyncTest {

    @Mock
    private ProductSkuService productSkuService;

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private CuttingBundleService cuttingBundleService;

    @Mock
    private ScanRecordMapper scanRecordMapper;

    @Mock
    private ProductWarehousingMapper productWarehousingMapper;

    @Mock
    private ProductWarehousingService productWarehousingService; // For Orchestrator test

    @InjectMocks
    private ProductWarehousingServiceImpl productWarehousingServiceImpl;

    @InjectMocks
    private ProductWarehousingOrchestrator productWarehousingOrchestrator;

    @BeforeEach
    public void setup() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), CuttingBundle.class);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""),
                ProductWarehousing.class);
    }

    @Test
    public void testSaveWarehousingIncrementsStock() {
        // Setup Service Impl manually to inject mocks (since @InjectMocks might not
        // handle mixed mocks well if not careful)
        // Actually, let's just test ServiceImpl's method saveWarehousingAndUpdateOrder
        ReflectionTestUtils.setField(productWarehousingServiceImpl, "productSkuService", productSkuService);
        ReflectionTestUtils.setField(productWarehousingServiceImpl, "productionOrderService", productionOrderService);
        ReflectionTestUtils.setField(productWarehousingServiceImpl, "cuttingBundleService", cuttingBundleService);
        ReflectionTestUtils.setField(productWarehousingServiceImpl, "scanRecordMapper", scanRecordMapper);
        ReflectionTestUtils.setField(productWarehousingServiceImpl, "baseMapper", productWarehousingMapper);

        ProductWarehousing warehousing = new ProductWarehousing();
        warehousing.setId("W1");
        warehousing.setOrderId("O1");
        warehousing.setStyleNo("STYLE001");
        warehousing.setQualifiedQuantity(10);
        warehousing.setWarehousingQuantity(10);
        warehousing.setCuttingBundleId("B1");

        ProductionOrder order = new ProductionOrder();
        order.setId("O1");
        order.setStyleNo("STYLE001");
        order.setColor("RED");
        order.setSize("L");
        order.setDeleteFlag(0); // Set deleteFlag to 0
        when(productionOrderService.getById("O1")).thenReturn(order);

        CuttingBundle bundle = new CuttingBundle();
        bundle.setId("B1");
        bundle.setColor("RED");
        bundle.setSize("L");
        bundle.setQuantity(100); // Set quantity
        bundle.setProductionOrderId("O1");
        when(cuttingBundleService.getById("B1")).thenReturn(bundle);

        // Mock list for sumCuttingQuantityByOrderId
        doReturn(List.of(bundle)).when(cuttingBundleService).list(ArgumentMatchers.<Wrapper<CuttingBundle>>any());

        // Mock save
        when(productWarehousingMapper.insert(any(ProductWarehousing.class))).thenReturn(1);
        // Mock list for sum calculation (return empty list so sum is 0)
        when(productWarehousingMapper.selectList(any())).thenReturn(Collections.emptyList());

        productWarehousingServiceImpl.saveWarehousingAndUpdateOrder(warehousing);

        verify(productSkuService).updateStock("STYLE001-RED-L", 10);
    }

    @Test
    public void testDeleteWarehousingDecrementsStock() {
        ReflectionTestUtils.setField(productWarehousingOrchestrator, "productWarehousingService",
                productWarehousingService);
        ReflectionTestUtils.setField(productWarehousingOrchestrator, "productSkuService", productSkuService);
        ReflectionTestUtils.setField(productWarehousingOrchestrator, "cuttingBundleService", cuttingBundleService);
        ReflectionTestUtils.setField(productWarehousingOrchestrator, "productionOrderService", productionOrderService);

        // Use mocks for ScanRecord stuff too if needed, but delete mainly uses above
        ReflectionTestUtils.setField(productWarehousingOrchestrator, "scanRecordDomainService",
                mock(com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService.class));

        ProductWarehousing warehousing = new ProductWarehousing();
        warehousing.setId("W1");
        warehousing.setOrderId("O1");
        warehousing.setStyleNo("STYLE001");
        warehousing.setQualifiedQuantity(10);
        warehousing.setCuttingBundleId("B1");
        warehousing.setDeleteFlag(0);

        when(productWarehousingService.getById("W1")).thenReturn(warehousing);
        when(productWarehousingService.updateById(any(ProductWarehousing.class))).thenReturn(true);

        CuttingBundle bundle = new CuttingBundle();
        bundle.setId("B1");
        bundle.setColor("RED");
        bundle.setSize("L");
        when(cuttingBundleService.getById("B1")).thenReturn(bundle);

        productWarehousingOrchestrator.delete("W1");

        verify(productSkuService).updateStock("STYLE001-RED-L", -10);
    }
}
