package com.fashion.supplychain.intelligence.dto;

import java.util.Map;

/**
 * AI 图表配置（功能 H 图表自动渲染）。
 *
 * <p>AI 响应中的【CHART】...【/CHART】块经解析后生成该对象，前端根据 type + config 渲染 ECharts。
 */
public class AiChartInfo {

    /** 图表类型：bar / line / pie / scatter / gauge */
    private String type;

    /** 图表标题 */
    private String title;

    /** ECharts 配置 option（含 series / xAxis / yAxis 等） */
    private Map<String, Object> config;

    public AiChartInfo() {}

    public AiChartInfo(String type, String title, Map<String, Object> config) {
        this.type = type;
        this.title = title;
        this.config = config;
    }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public Map<String, Object> getConfig() { return config; }
    public void setConfig(Map<String, Object> config) { this.config = config; }
}
