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

    private List<FollowUpAction> followUpActions = new ArrayList<>();

    /** 功能 H：AI 自动解析的图表列表（【CHART】块） */
    private List<AiChartInfo> charts = new ArrayList<>();

    /** 功能 G：本轮执行的高风险工具列表，前端用于触发二次确认对话框 */
    private List<HighRiskActionInfo> highRiskActions = new ArrayList<>();

    /** 功能 F：会话 ID，前端可用于延续多轮对话（如与流式一致） */
    private String conversationId;
}
