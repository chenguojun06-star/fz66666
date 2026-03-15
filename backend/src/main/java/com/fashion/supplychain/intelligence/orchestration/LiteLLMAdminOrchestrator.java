package com.fashion.supplychain.intelligence.orchestration;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.stream.Collectors;

/**
 * LiteLLM 网关管理编排器。
 *
 * <p>职责：独立管理 LiteLLM 实例的健康探活、可用模型列表查询、路由策略汇总。
 * 与 {@link IntelligenceModelGatewayOrchestrator} 的区别：
 * 后者只读 Spring 配置状态，本编排器发起真实 HTTP 通信。
 *
 * <p>配置项由 {@link IntelligenceModelGatewayOrchestrator} 统一持有，本编排器通过注入读取。
 */
@Service
@Slf4j
public class LiteLLMAdminOrchestrator {

    @Autowired
    private IntelligenceModelGatewayOrchestrator gatewayOrchestrator;

    private final RestTemplate restTemplate = new RestTemplate();

    // ──────────────────────────────────────────────────────────────
    //  健康探活
    // ──────────────────────────────────────────────────────────────

    /**
     * 对 LiteLLM 实例发起 HTTP 健康检查（GET /health）。
     * @return true=实例存活且 2xx 响应；false=未启用、未配置或请求失败
     */
    public boolean ping() {
        if (!gatewayOrchestrator.isGatewayReady()) {
            log.debug("[LiteLLM] 网关未启用，跳过 ping");
            return false;
        }
        try {
            String url = gatewayOrchestrator.getGatewayBaseUrl() + "/health";
            ResponseEntity<String> resp = restTemplate.getForEntity(url, String.class);
            boolean alive = resp.getStatusCode().is2xxSuccessful();
            log.info("[LiteLLM] health={} url={}", alive ? "OK" : "FAIL", url);
            return alive;
        } catch (Exception e) {
            log.warn("[LiteLLM] 健康检查失败: {}", e.getMessage());
            return false;
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  模型列表
    // ──────────────────────────────────────────────────────────────

    /**
     * 查询 LiteLLM 注册的可用模型列表（GET /v1/models）。
     * @return 模型 ID 列表；网关未就绪或请求失败返回空列表
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public List<String> listModels() {
        if (!gatewayOrchestrator.isGatewayReady()) {
            return Collections.emptyList();
        }
        try {
            String url = gatewayOrchestrator.getGatewayBaseUrl() + "/v1/models";
            ResponseEntity<Map> resp = restTemplate.getForEntity(url, Map.class);
            if (!resp.getStatusCode().is2xxSuccessful() || resp.getBody() == null) {
                return Collections.emptyList();
            }
            List<Map<String, Object>> data = (List<Map<String, Object>>) resp.getBody().get("data");
            if (data == null) return Collections.emptyList();
            return data.stream()
                    .map(m -> String.valueOf(m.getOrDefault("id", "")))
                    .filter(s -> !s.isEmpty())
                    .collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[LiteLLM] 模型列表查询失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  汇总状态
    // ──────────────────────────────────────────────────────────────

    /**
     * 汇总当前 LiteLLM 网关治理状态。
     * 包含：alive/activeModel/modelCount/models/fallbackEnabled/routingSummary
     */
    public Map<String, Object> summary() {
        boolean alive = ping();
        List<String> models = alive ? listModels() : Collections.emptyList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("alive", alive);
        result.put("activeModel", gatewayOrchestrator.getActiveModelName());
        result.put("modelCount", models.size());
        result.put("models", models);
        result.put("fallbackEnabled", gatewayOrchestrator.isFallbackEnabled());
        result.put("baseUrl", alive ? gatewayOrchestrator.getGatewayBaseUrl() : "");
        result.put("status", alive ? "ready" : (gatewayOrchestrator.isGatewayReady() ? "unreachable" : "disabled"));
        return result;
    }
}
