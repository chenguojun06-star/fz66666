package com.fashion.supplychain.intelligence.orchestration;

import org.springframework.stereotype.Service;

/**
 * 智能升级编排器。
 *
 * <p>职责：根据风险等级、停滞时长、异常级别统一给出升级级别与时效建议。</p>
 */
@Service
public class SmartEscalationOrchestrator {

    public String escalationByRisk(String riskLevel) {
        if (riskLevel == null) {
            return "L1";
        }
        String value = riskLevel.trim().toLowerCase();
        if ("overdue".equals(value) || "danger".equals(value) || "high".equals(value) || "critical".equals(value)) {
            return "L3";
        }
        if ("warning".equals(value) || "medium".equals(value)) {
            return "L2";
        }
        return "L1";
    }

    public String escalationBySilentMinutes(long minutesSilent) {
        if (minutesSilent >= 240) {
            return "L3";
        }
        if (minutesSilent >= 60) {
            return "L2";
        }
        return "L1";
    }

    public String dueHintByEscalation(String escalationLevel) {
        if ("L3".equalsIgnoreCase(escalationLevel)) {
            return "2小时内处理";
        }
        if ("L2".equalsIgnoreCase(escalationLevel)) {
            return "今日处理";
        }
        return "本周处理";
    }
}
