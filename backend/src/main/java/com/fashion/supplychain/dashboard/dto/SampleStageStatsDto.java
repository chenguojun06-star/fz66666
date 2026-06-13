package com.fashion.supplychain.dashboard.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 样衣开发各环节进行中款号统计DTO
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SampleStageStatsDto {

    /**
     * 环节名称（如：纸样开发、BOM配置、尺码表等）
     */
    private String stageName;

    /**
     * 该环节进行中款号数量
     */
    private Integer count;

    /**
     * 该环节进行中款号ID列表
     */
    private List<Long> styleIds;

    /**
     * 该环节进行中款号编号列表
     */
    private List<String> styleNos;
}
