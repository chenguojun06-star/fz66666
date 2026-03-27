package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class AiAdvisorChatResponse {

    private String answer;

    private String displayAnswer;

    private String source;

    private String commandId;

    private List<String> suggestions = new ArrayList<>();

    private List<XiaoyunInsightCard> cards = new ArrayList<>();
}
