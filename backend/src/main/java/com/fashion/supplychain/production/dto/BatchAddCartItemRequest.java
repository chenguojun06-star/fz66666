package com.fashion.supplychain.production.dto;

import lombok.Data;
import java.util.List;

@Data
public class BatchAddCartItemRequest {
    private List<AddCartItemRequest> items;
}
