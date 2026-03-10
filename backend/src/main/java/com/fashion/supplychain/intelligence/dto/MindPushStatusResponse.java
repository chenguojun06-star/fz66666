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

    /** 推送时段：开始时间 HH:mm */
    private String notifyTimeStart;

    /** 推送时段：结束时间 HH:mm */
    private String notifyTimeEnd;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LogItem {
        /** DB 主键，供前端 key 使用 */
        private Long id;
        private String ruleCode;
        private String orderNo;
        /** 推送摘要文本（对应前端 pushMessage 字段）*/
        private String pushMessage;
        private String channel;
        /** 推送时间（对应前端 createdAt 字段）*/
        private LocalDateTime createdAt;
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
