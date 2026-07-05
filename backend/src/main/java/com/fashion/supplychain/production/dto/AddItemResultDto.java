package com.fashion.supplychain.production.dto;

import lombok.Data;

@Data
public class AddItemResultDto {
    private String itemId;
    private MergeSuggestionDto mergeSuggestion;
    private Boolean merged;
}
