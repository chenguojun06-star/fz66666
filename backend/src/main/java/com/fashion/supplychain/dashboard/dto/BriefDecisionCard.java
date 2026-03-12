package com.fashion.supplychain.dashboard.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 日报结构化判断卡
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class BriefDecisionCard {
    private String level;
    private String title;
    private String summary;
    private String painPoint;
    private String confidence;
    private String source;
    private List<String> evidence;
    private String execute;
    private String actionLabel;
    private String actionPath;
}
