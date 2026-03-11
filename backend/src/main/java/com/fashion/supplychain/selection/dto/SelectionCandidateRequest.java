package com.fashion.supplychain.selection.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

/** 创建/更新候选款请求 */
@Data
public class SelectionCandidateRequest {
    private Long batchId;
    private String styleName;
    private String category;
    private String colorFamily;
    private String fabricType;
    private String sourceType;
    private String sourceDesc;
    private List<String> referenceImages;
    private BigDecimal costEstimate;
    private BigDecimal targetPrice;
    private Integer targetQty;
    private String seasonTags;
    private String styleTags;
    private String remark;
}
