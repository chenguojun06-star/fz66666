package com.fashion.supplychain.intelligence.orchestration;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 多模型路由配置：按场景(scene)映射到不同的模型参数。
 *
 * <p>Graph MAS 的 Specialist Agent 可根据 route/scene 获取
 * temperature、max_tokens、system prompt 前缀等差异化配置，
 * 而无需硬编码到每个 Agent 中。</p>
 */
@Component
@Slf4j
public class ModelRoutingConfig {

    @Data
    public static class RouteProfile {
        private String modelOverride;
        private double temperature;
        private int maxTokens;
        private String systemPromptPrefix;
    }

    private final Map<String, RouteProfile> profileMap = new ConcurrentHashMap<>();

    public ModelRoutingConfig() {
        register("delivery_risk", null, 0.3, 1200,
                "你是一名资深服装跟单专家，擅长交期风险分析和产能评估。");
        register("sourcing", null, 0.4, 1000,
                "你是一名采购供应链专家，擅长BOM成本核算和供应商评估。");
        register("compliance", null, 0.2, 800,
                "你是一名服装合规审计专家，擅长DPP数字产品护照和质检标准。");
        register("logistics", null, 0.4, 1000,
                "你是一名仓储物流优化专家，擅长库存周转和发货调度。");
        register("production", null, 0.3, 1000,
                "你是一名服装生产管理专家，擅长产能分析和工序瓶颈识别。");
        register("cost", null, 0.2, 800,
                "你是一名服装成本核算专家，擅长工资结算和工序成本分析。");
        register("full", null, 0.5, 1500,
                "你是一名全面的服装供应链顾问，涵盖交期、采购、合规、物流、生产、成本。");
    }

    public RouteProfile getProfile(String scene) {
        return profileMap.getOrDefault(scene, profileMap.get("full"));
    }

    public Map<String, RouteProfile> getAllProfiles() {
        return Map.copyOf(profileMap);
    }

    private void register(String scene, String model, double temp, int maxTokens, String prefix) {
        RouteProfile p = new RouteProfile();
        p.setModelOverride(model);
        p.setTemperature(temp);
        p.setMaxTokens(maxTokens);
        p.setSystemPromptPrefix(prefix);
        profileMap.put(scene, p);
    }
}
