package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.Data;

/**
 * 智能中枢快照响应 DTO
 *
 * <p>用于把分散的智能能力聚合成一个统一的“AI 大脑视图”，
 * 供驾驶舱、系统设置页、后续动作中心统一消费。</p>
 */
@Data
public class IntelligenceBrainSnapshotResponse {

    private Long tenantId;
    private String generatedAt;
    private Map<String, Boolean> featureFlags = new LinkedHashMap<>();
    private BrainSummary summary = new BrainSummary();
    private LearningSummary learning = new LearningSummary();
    private ModelGatewaySummary modelGateway = new ModelGatewaySummary();
    private ObservabilitySummary observability = new ObservabilitySummary();
    private List<BrainSignal> signals = new ArrayList<>();
    private List<BrainAction> actions = new ArrayList<>();

    @Data
    public static class BrainSummary {
        private int healthIndex;
        private String healthGrade;
        private String topRisk;
        private int highRiskOrders;
        private int anomalyCount;
        private int stagnantFactories;
        private int activeFactories;
        private int activeWorkers;
        private long todayScanQty;
        private int pendingNotifications;
        private int suggestedActions;
    }

    @Data
    public static class LearningSummary {
        private long totalSamples;
        private int stageCount;
        private long feedbackCount;
        private double accuracyRate;
        private String lastLearnTime;
    }

    @Data
    public static class ModelGatewaySummary {
        private boolean enabled;
        private String provider;
        private String baseUrl;
        private String routingStrategy;
        private String activeModel;
        private boolean fallbackEnabled;
        private String status;
    }

    @Data
    public static class ObservabilitySummary {
        private boolean enabled;
        private String provider;
        private String endpoint;
        private boolean capturePrompts;
        private int sampleRate;
        private String status;
    }

    @Data
    public static class BrainSignal {
        private String signalType;
        private String level;
        private String title;
        private String summary;
        private String source;
        private String relatedOrderNo;
        private String ownerRole;
    }

    @Data
    public static class BrainAction {
        private String actionType;
        private String priority;
        private String ownerRole;
        private String title;
        private String summary;
        private String reason;
        private String routePath;
        private boolean autoExecutable;
    }
}
