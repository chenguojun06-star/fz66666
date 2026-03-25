package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class CollaborationDispatchResponse {
    private boolean success;
    private boolean dispatched;
    private String summary;
    private String orderNo;
    private String ownerRole;
    private String routePath;
    private String currentStage;
    private String nextStep;
    private String dueHint;
    private String dueAt;
    private String updatedAt;
    private boolean overdue;
    private int matchedCount;
    private int noticeCount;
    private ActionCenterResponse.ActionTask collaborationTask;
    private List<String> unmatchedReasons = new ArrayList<>();
    private List<Recipient> recipients = new ArrayList<>();
    private List<HistoryEntry> history = new ArrayList<>();

    @Data
    public static class Recipient {
        private Long userId;
        private String username;
        private String name;
        private String roleName;
        private String displayName;
        private String dispatchStatus;
        private String processingStage;
        private String dueHint;
        private String nextAction;
        private String updatedAt;
    }

    @Data
    public static class HistoryEntry {
        private String action;
        private String actor;
        private String stage;
        private String remark;
        private String createdAt;
    }
}
