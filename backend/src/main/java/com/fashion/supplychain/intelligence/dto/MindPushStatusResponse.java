package com.fashion.supplychain.intelligence.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/**
 * MindPush 状态汇总响应
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MindPushStatusResponse {

    /** 当前已配置的推送规则列表 */
    private List<MindPushRuleDTO> rules;

    /** 近期推送日志 */
    private List<LogItem> recentLog;

    /** 统计汇总 */
    private Stats stats;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LogItem {
        private String ruleCode;
        private String orderNo;
        private String title;
        private String content;
        private LocalDateTime pushedAt;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Stats {
        /** 过去 24h 推送次数 */
        private long pushed24h;
        /** 过去 7 天推送次数 */
        private long pushed7d;
        /** 当前生效规则数量 */
        private long activeRules;
    }
}
