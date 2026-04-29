package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

import java.util.List;

@Data
public class XiaoyunStructuredResponse {

    private String displayText;

    private List<XiaoyunInsightCard> insightCards;

    private List<XiaoyunActionCard> actionCards;

    private List<XiaoyunChartSpec> charts;

    private List<XiaoyunStepWizard> stepWizards;

    private List<XiaoyunClarification> clarifications;

    private XiaoyunOverdueFactory overdueFactory;

    private XiaoyunReportPreview reportPreview;

    private List<XiaoyunFollowUp> followUpActions;

    private XiaoyunAgentTrace agentTrace;

    @Data
    public static class XiaoyunActionCard {
        private String cardType;
        private String title;
        private String description;
        private String actionLabel;
        private String actionPath;
        private String urgency;
        private String orderId;
        private String factoryName;
    }

    @Data
    public static class XiaoyunChartSpec {
        private String chartType;
        private String title;
        private List<String> labels;
        private List<Double> values;
        private List<XiaoyunSeries> series;
        private String summary;

        @Data
        public static class XiaoyunSeries {
            private String name;
            private List<Double> data;
            private String color;
        }
    }

    @Data
    public static class XiaoyunStepWizard {
        private String title;
        private List<XiaoyunStep> steps;
        private int currentStep;

        @Data
        public static class XiaoyunStep {
            private String label;
            private String description;
            private String status;
        }
    }

    @Data
    public static class XiaoyunClarification {
        private String question;
        private List<String> options;
        private boolean required;
    }

    @Data
    public static class XiaoyunOverdueFactory {
        private String factoryName;
        private double overdueRate;
        private int totalOrders;
        private int overdueOrders;
        private List<XiaoyunOverdueOrder> topOverdueOrders;

        @Data
        public static class XiaoyunOverdueOrder {
            private String orderNo;
            private String styleName;
            private int daysOverdue;
            private double progress;
        }
    }

    @Data
    public static class XiaoyunReportPreview {
        private String title;
        private String period;
        private List<XiaoyunKpi> kpis;
        private List<XiaoyunRiskItem> risks;

        @Data
        public static class XiaoyunKpi {
            private String label;
            private String value;
            private String trend;
            private String level;
        }

        @Data
        public static class XiaoyunRiskItem {
            private String title;
            private String level;
            private String description;
        }
    }

    @Data
    public static class XiaoyunFollowUp {
        private String label;
        private String action;
        private String icon;
    }

    @Data
    public static class XiaoyunAgentTrace {
        private String route;
        private int confidenceScore;
        private List<XiaoyunTraceStep> steps;

        @Data
        public static class XiaoyunTraceStep {
            private String nodeId;
            private String nodeName;
            private long durationMs;
            private String status;
        }
    }
}
