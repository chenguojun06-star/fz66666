package com.fashion.supplychain.production;

import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.impl.ProductWarehousingHelper;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.orchestration.ProductWarehousingOrchestrator;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.impl.ProductWarehousingServiceImpl;
import com.fashion.supplychain.style.service.ProductSkuService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
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

    @Mock
    private ProductWarehousingHelper helper; // For ServiceImpl test (stock update delegated to helper)

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
        // Inject mocks matching current ServiceImpl fields
        // (productSkuService was refactored into ProductWarehousingHelper)
        ReflectionTestUtils.setField(productWarehousingServiceImpl, "helper", helper);
        ReflectionTestUtils.setField(productWarehousingServiceImpl, "productionOrderService", productionOrderService);
        ReflectionTestUtils.setField(productWarehousingServiceImpl, "cuttingBundleService", cuttingBundleService);
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
        order.setDeleteFlag(0);
        when(productionOrderService.getById("O1")).thenReturn(order);

        CuttingBundle bundle = new CuttingBundle();
        bundle.setId("B1");
        bundle.setColor("RED");
        bundle.setSize("L");
        bundle.setQuantity(100);
        bundle.setProductionOrderId("O1");
        when(cuttingBundleService.getById("B1")).thenReturn(bundle);

        // Mock save (baseMapper.insert)
        when(productWarehousingMapper.insert(any(ProductWarehousing.class))).thenReturn(1);

        productWarehousingServiceImpl.saveWarehousingAndUpdateOrder(warehousing);

        // Verify stock update is delegated to helper
        verify(helper).updateSkuStock(any(ProductWarehousing.class), any(ProductionOrder.class),
                any(CuttingBundle.class), eq(10));
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
