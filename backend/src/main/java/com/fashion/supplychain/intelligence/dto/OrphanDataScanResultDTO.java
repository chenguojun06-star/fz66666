package com.fashion.supplychain.intelligence.dto;

import java.time.LocalDateTime;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OrphanDataScanResultDTO {

    private int totalOrphanCount;
    private Map<String, CategoryStat> categoryStats;
    private LocalDateTime scanTime;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CategoryStat {
        private String tableName;
        private String tableLabel;
        private String module;
        private int count;
        private String icon;
    }
}
