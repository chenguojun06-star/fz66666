package com.fashion.supplychain.production;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.mapper.MaterialStockMapper;
import com.fashion.supplychain.production.service.impl.MaterialPurchaseServiceImpl;
import com.fashion.supplychain.production.service.impl.MaterialStockServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import org.mockito.quality.Strictness;
import org.mockito.junit.jupiter.MockitoSettings;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
public class MaterialStockTest {

    @Mock
    private MaterialStockMapper materialStockMapper;

    @Mock
    private MaterialPurchaseMapper materialPurchaseMapper;

    @InjectMocks
    private MaterialStockServiceImpl materialStockService;

    @InjectMocks
    private MaterialPurchaseServiceImpl materialPurchaseService;

    @Test
    public void testIncreaseStock() {
        ReflectionTestUtils.setField(materialStockService, "baseMapper", materialStockMapper);

        MaterialPurchase p = new MaterialPurchase();
        p.setMaterialId("M1");
        p.setMaterialCode("CODE1");
        p.setColor("RED");
        p.setSize("L");

        // Mock finding existing stock (none)
        doReturn(null).when(materialStockMapper).selectOne(any(Wrapper.class));
        // Mock insert
        when(materialStockMapper.insert(any(MaterialStock.class))).thenReturn(1);
        // Mock update - now calls updateStockOnInbound instead of updateStockQuantity
        doReturn(1).when(materialStockMapper).updateStockOnInbound(any(), eq(10), any(), any(), any());

        materialStockService.increaseStock(p, 10);

        verify(materialStockMapper).insert(any(MaterialStock.class));
        verify(materialStockMapper).updateStockOnInbound(any(), eq(10), any(), any(), any());
    }

    @Test
    public void testUpdateArrivedQuantitySyncsStock() {
        ReflectionTestUtils.setField(materialPurchaseService, "materialStockService", materialStockService);
        ReflectionTestUtils.setField(materialPurchaseService, "baseMapper", materialPurchaseMapper);
        ReflectionTestUtils.setField(materialStockService, "baseMapper", materialStockMapper);

        MaterialPurchase p = new MaterialPurchase();
        p.setId("P1");
        p.setArrivedQuantity(0);
        p.setMaterialId("M1");

        when(materialPurchaseMapper.selectById("P1")).thenReturn(p);
        doReturn(1).when(materialPurchaseMapper).updateById(any(MaterialPurchase.class));

        // Mock stock logic
        doReturn(new MaterialStock()).when(materialStockMapper).selectOne(any(Wrapper.class));
        doReturn(1).when(materialStockMapper).updateStockOnInbound(any(), eq(5), any(), any(), any());

        materialPurchaseService.updateArrivedQuantity("P1", 5, "Remark");

        verify(materialStockMapper).updateStockOnInbound(any(), eq(5), any(), any(), any());
    }
}
