package com.fashion.supplychain.production.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BatchAddItemResultDto {
    private int totalCount;
    private int successCount;
    private int mergedCount;
    private List<MergeSuggestionDto> mergeSuggestions;
}
