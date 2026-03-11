package com.fashion.supplychain.selection.dto;

import lombok.Data;

/** 创建/更新批次请求 */
@Data
public class SelectionBatchRequest {
    private String batchName;
    private String season;
    private Integer year;
    private String theme;
    private Integer targetQty;
    private String remark;
}
