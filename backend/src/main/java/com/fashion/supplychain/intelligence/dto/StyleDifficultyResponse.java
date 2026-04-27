package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

@Data
public class StyleDifficultyResponse {
    private Integer difficultyScore;
    private String difficultyLevel;
    private String reason;
}
