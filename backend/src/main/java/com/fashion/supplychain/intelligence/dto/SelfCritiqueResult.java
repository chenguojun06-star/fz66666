package com.fashion.supplychain.intelligence.dto;

import java.util.Collections;
import java.util.Map;

/**
 * 自我批评评分结果 DTO（P0-2 反思记忆闭环）。
 *
 * <p>封装 SelfCriticService 的评分结果，供 ReflectiveMemoryWriter 消费。
 * <br>dimensions/suggestions 可为空（SelfCriticService 当前仅返回综合分），
 * ReflectiveMemoryWriter 会优雅处理空值。</p>
 */
public class SelfCritiqueResult {

    /** 综合评分（0-100），null 表示未评分 */
    private Double score;

    /** 各维度评分（维度名→分数 0-100），可为空 Map */
    private Map<String, Double> dimensions;

    /** 改进建议文本，可为 null/空 */
    private String suggestions;

    public SelfCritiqueResult() {
        this.dimensions = Collections.emptyMap();
    }

    public static SelfCritiqueResult of(double score) {
        SelfCritiqueResult r = new SelfCritiqueResult();
        r.score = score;
        r.dimensions = Collections.emptyMap();
        r.suggestions = "";
        return r;
    }

    public static SelfCritiqueResult of(double score, Map<String, Double> dimensions, String suggestions) {
        SelfCritiqueResult r = new SelfCritiqueResult();
        r.score = score;
        r.dimensions = dimensions != null ? dimensions : Collections.emptyMap();
        r.suggestions = suggestions != null ? suggestions : "";
        return r;
    }

    public Double getScore() {
        return score;
    }

    public void setScore(Double score) {
        this.score = score;
    }

    public Map<String, Double> getDimensions() {
        return dimensions;
    }

    public void setDimensions(Map<String, Double> dimensions) {
        this.dimensions = dimensions;
    }

    public String getSuggestions() {
        return suggestions;
    }

    public void setSuggestions(String suggestions) {
        this.suggestions = suggestions;
    }
}
