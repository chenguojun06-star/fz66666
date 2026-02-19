package com.fashion.supplychain.style.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.style.dto.StockUpdateDTO;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
public class ProductSkuControllerTest {

    private MockMvc mockMvc;

    @Mock
    private ProductSkuService productSkuService;

    @InjectMocks
    private ProductSkuController productSkuController;

    private ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    public void setup() {
        mockMvc = MockMvcBuilders.standaloneSetup(productSkuController).build();
    }

    @Test
    public void testGetInventory() throws Exception {
        String skuCode = "SKU123";
        ProductSku sku = new ProductSku();
        sku.setSkuCode(skuCode);
        sku.setStockQuantity(100);

        when(productSkuService.getOne(any(LambdaQueryWrapper.class))).thenReturn(sku);

        mockMvc.perform(get("/api/style/sku/inventory/" + skuCode))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").value(100));
    }

    @Test
    public void testUpdateInventory() throws Exception {
        StockUpdateDTO dto = new StockUpdateDTO();
        dto.setSkuCode("SKU123");
        dto.setQuantity(50);

        mockMvc.perform(post("/api/style/sku/inventory/update")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(dto)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));

        verify(productSkuService).updateStock("SKU123", 50);
    }
}
