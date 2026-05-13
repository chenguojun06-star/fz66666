package com.fashion.supplychain.style.dto;

import com.fashion.supplychain.style.entity.ProductSku;
import lombok.Data;

import java.util.List;

@Data
public class SkuBatchUpdateDTO {
    private List<ProductSku> skuList;
    private List<Long> deletedIds;
}
