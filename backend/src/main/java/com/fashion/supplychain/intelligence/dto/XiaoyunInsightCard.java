package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class XiaoyunInsightCard {

    private String level;

    private String title;

    private String summary;

    private String painPoint;

    private String confidence;

    private String source;

    private List<String> evidence = new ArrayList<>();

    private String note;

    private String execute;

    private String actionLabel;

    private String actionPath;
}
