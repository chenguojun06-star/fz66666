package com.fashion.supplychain.intelligence.helper;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * What-If 自然语言场景解析 Helper
 *
 * <p>从 WhatIfSimulationOrchestrator 拆薄提取，负责将自然语言场景描述解析为标准场景列表。
 * 纯函数无状态，可独立测试。</p>
 *
 * <p>支持的模式：</p>
 * <ul>
 *   <li>"停电X天" / "停工X天" → DELAY_START</li>
 *   <li>"提前X天" / "加速X天" → ADVANCE_DELIVERY</li>
 *   <li>"增加X人" / "加X个工人" / "加班" → ADD_WORKERS</li>
 *   <li>"转X工厂" / "换工厂" / "转厂" → CHANGE_FACTORY</li>
 *   <li>"降价X%" / "降低成本X%" → COST_REDUCE</li>
 * </ul>
 *
 * @author xiaoyun
 * @since 2026-07-31
 */
@Component
@Slf4j
public class WhatIfScenarioParserHelper {

    /**
     * 将自然语言描述解析为标准场景列表
     *
     * @param naturalScenario 自然语言描述（支持多场景，用"|"或全角逗号分隔）
     * @return 标准场景列表
     */
    public List<Map<String, Object>> parseNaturalScenario(String naturalScenario) {
        List<Map<String, Object>> result = new ArrayList<>();

        // 支持多场景分隔符
        String[] parts = naturalScenario.split("[|，,]");

        for (String part : parts) {
            part = part.trim();
            if (part.isEmpty()) continue;

            Map<String, Object> scenario = parseSingleScenario(part);
            if (scenario != null) {
                result.add(scenario);
            } else {
                log.warn("[WhatIf] 无法解析场景描述: {}", part);
            }
        }

        return result;
    }

    private Map<String, Object> parseSingleScenario(String text) {
        Map<String, Object> scenario = new HashMap<>();
        String lower = text.toLowerCase();

        // 停电/停工 → DELAY_START
        if (lower.contains("停电") || lower.contains("停工") || lower.contains("停产")) {
            int days = extractNumber(text);
            if (days <= 0) days = 1;
            scenario.put("type", "DELAY_START");
            scenario.put("value", days);
            scenario.put("description", "因" + text + "延迟开工");
            return scenario;
        }

        // 提前/加速/赶工 → ADVANCE_DELIVERY
        if (lower.contains("提前") || lower.contains("加速") || lower.contains("赶工") || lower.contains("加急")) {
            int days = extractNumber(text);
            if (days <= 0) days = 3;
            scenario.put("type", "ADVANCE_DELIVERY");
            scenario.put("value", days);
            scenario.put("description", "因" + text + "提前交货");
            return scenario;
        }

        // 增加工人/加班/加人手 → ADD_WORKERS
        if (lower.contains("增加工人") || lower.contains("加班") || lower.contains("加人手") || lower.contains("增援")) {
            int workers = extractNumber(text);
            if (workers <= 0) workers = 5;
            scenario.put("type", "ADD_WORKERS");
            scenario.put("value", workers);
            scenario.put("description", "因" + text + "增加工人");
            return scenario;
        }

        // 转工厂/换工厂 → CHANGE_FACTORY
        if ((lower.contains("转") && (lower.contains("工厂") || lower.contains("厂")))
                || lower.contains("换工厂") || lower.contains("转厂")) {
            String factoryName = extractFactoryName(text);
            scenario.put("type", "CHANGE_FACTORY");
            scenario.put("factoryName", factoryName);
            scenario.put("description", "将订单转至" + factoryName);
            return scenario;
        }

        // 降价/降低成本 → COST_REDUCE
        if (lower.contains("降价") || lower.contains("降低成本") || lower.contains("省成本")) {
            int pct = extractNumber(text);
            if (pct <= 0) pct = 10;
            scenario.put("type", "COST_REDUCE");
            scenario.put("value", pct);
            scenario.put("description", "因" + text + "降低成本");
            return scenario;
        }

        // 原材料/物料晚到 → DELAY_START
        if ((lower.contains("原材料") && lower.contains("晚"))
                || (lower.contains("物料") && lower.contains("迟到"))
                || lower.contains("断料")) {
            int days = extractNumber(text);
            if (days <= 0) days = 5;
            scenario.put("type", "DELAY_START");
            scenario.put("value", days);
            scenario.put("description", "因" + text + "延迟开工");
            return scenario;
        }

        // 无法解析，返回null
        return null;
    }

    private int extractNumber(String text) {
        // 提取中文/阿拉伯数字
        java.util.regex.Pattern p = java.util.regex.Pattern.compile("\\d+");
        java.util.regex.Matcher m = p.matcher(text);
        if (m.find()) {
            return Integer.parseInt(m.group());
        }
        return 0;
    }

    private String extractFactoryName(String text) {
        // 提取工厂名称（A工厂/B工厂/C工厂）
        java.util.regex.Pattern p = java.util.regex.Pattern.compile("[A-Za-z0-9一二三四五六七八九十]+工厂");
        java.util.regex.Matcher m = p.matcher(text);
        if (m.find()) {
            return m.group().replace("工厂", "");
        }
        return "其他工厂";
    }
}
