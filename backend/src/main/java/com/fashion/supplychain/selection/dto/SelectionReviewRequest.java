package com.fashion.supplychain.selection.dto;

import lombok.Data;

/** 评审提交请求 */
@Data
public class SelectionReviewRequest {
    private Long candidateId;
    private Integer score;
    /** APPROVE / REJECT / HOLD */
    private String decision;
    private String comment;
    /** JSON：{ "craft": 80, "cost": 70, "trend": 90, "demand": 85 } */
    private String dimensions;
}
