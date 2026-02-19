package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.ProductSkuMapper;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;

import org.springframework.test.util.ReflectionTestUtils;
import org.junit.jupiter.api.BeforeEach;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class ProductSkuServiceImplTest {

    @InjectMocks
    private ProductSkuServiceImpl productSkuService;

    @Mock
    private StyleInfoMapper styleInfoMapper;

    @Mock
    private ProductSkuMapper productSkuMapper;

    @Mock
    private ObjectMapper objectMapper;

    @BeforeEach
    public void setup() {
        // Manually set the baseMapper for MyBatis Plus ServiceImpl
        ReflectionTestUtils.setField(productSkuService, "baseMapper", productSkuMapper);
    }

    @Test
    public void testGenerateSkusForStyle() throws Exception {
        Long styleId = 1L;
        StyleInfo style = new StyleInfo();
        style.setId(styleId);
        style.setStyleNo("STYLE001");
        style.setPrice(new BigDecimal("100.00"));
        style.setSizeColorConfig("[{\"color\":\"Red\",\"sizes\":[{\"size\":\"L\",\"quantity\":10}]}]");

        when(styleInfoMapper.selectById(styleId)).thenReturn(style);

        // Use a real ObjectMapper for parsing test
        ObjectMapper realMapper = new ObjectMapper();
        when(objectMapper.readValue(any(String.class), any(com.fasterxml.jackson.core.type.TypeReference.class)))
                .thenReturn(realMapper.readValue(style.getSizeColorConfig(),
                        new com.fasterxml.jackson.core.type.TypeReference<java.util.List<java.util.Map<String, Object>>>() {
                        }));

        // Use lenient to avoid strict stubbing issues if the arguments don't match
        // exactly in some internal call
        lenient().when(productSkuMapper.selectOne(any())).thenReturn(null);
        lenient().when(productSkuMapper.insert(any(ProductSku.class))).thenReturn(1);

        productSkuService.generateSkusForStyle(styleId);

        // Verify that insert was called once
        verify(productSkuMapper, times(1)).insert(any(ProductSku.class));
    }
}
