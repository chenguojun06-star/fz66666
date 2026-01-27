package com.fashion.supplychain.dashboard.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 扫菲次数折线图响应
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ScanCountChartResponse {
    /**
     * 日期列表
     */
    private List<String> dates;

    /**
     * 扫菲次数列表
     */
    private List<Integer> scanCounts;
}
