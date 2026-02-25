package com.fashion.supplychain.integration.util;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * 第三方集成专用 HTTP 客户端
 *
 * 统一处理：超时控制、错误日志、请求日志、重试
 *
 * 使用示例（在 Adapter 中）：
 * <pre>
 *   // POST JSON
 *   String response = httpClient.postJson(
 *       "https://sfapi.sf-express.com/std/service",
 *       Map.of("msgType", "EXP_RECE_CREATE_ORDER", "msgData", jsonBody),
 *       String.class
 *   );
 *
 *   // POST Form
 *   String response = httpClient.postForm(
 *       "https://openapi.alipay.com/gateway.do",
 *       formParams,
 *       String.class
 *   );
 * </pre>
 */
@Slf4j
@Component
public class IntegrationHttpClient {

    private final RestTemplate restTemplate;

    public IntegrationHttpClient() {
        // 超时配置：5s连接，15s读取（适合国内API）
        org.springframework.http.client.SimpleClientHttpRequestFactory factory =
                new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(15_000);
        this.restTemplate = new RestTemplate(factory);
    }

    // =====================================================
    // POST JSON（最常用）
    // =====================================================

    /**
     * POST JSON 请求
     *
     * @param url          接口地址
     * @param body         请求体（Map或DTO，会自动序列化为JSON）
     * @param responseType 响应类型
     * @param headers      附加Header（如 Authorization）
     */
    public <T> T postJson(String url, Object body, Class<T> responseType,
                          Map<String, String> headers) {
        HttpHeaders httpHeaders = new HttpHeaders();
        httpHeaders.setContentType(MediaType.APPLICATION_JSON);
        if (headers != null) {
            headers.forEach(httpHeaders::set);
        }
        HttpEntity<Object> entity = new HttpEntity<>(body, httpHeaders);

        log.debug("[集成HTTP] POST {} | body={}", url, body);
        try {
            ResponseEntity<T> response = restTemplate.exchange(url, HttpMethod.POST, entity, responseType);
            log.debug("[集成HTTP] 响应 {} | status={}", url, response.getStatusCode());
            return response.getBody();
        } catch (RestClientException e) {
            log.error("[集成HTTP] 请求失败 POST {} | error={}", url, e.getMessage());
            throw new IntegrationException("HTTP请求失败: " + url, e);
        }
    }

    /** POST JSON（无额外Header） */
    public <T> T postJson(String url, Object body, Class<T> responseType) {
        return postJson(url, body, responseType, null);
    }

    // =====================================================
    // POST Form（支付宝使用）
    // =====================================================

    /**
     * POST 表单请求（application/x-www-form-urlencoded）
     */
    public <T> T postForm(String url, Map<String, String> formParams, Class<T> responseType) {
        HttpHeaders httpHeaders = new HttpHeaders();
        httpHeaders.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        org.springframework.util.MultiValueMap<String, String> body =
                new org.springframework.util.LinkedMultiValueMap<>();
        formParams.forEach(body::add);

        HttpEntity<org.springframework.util.MultiValueMap<String, String>> entity =
                new HttpEntity<>(body, httpHeaders);

        log.debug("[集成HTTP] POST Form {} | params={}", url, formParams.keySet());
        try {
            ResponseEntity<T> response = restTemplate.exchange(url, HttpMethod.POST, entity, responseType);
            return response.getBody();
        } catch (RestClientException e) {
            log.error("[集成HTTP] Form请求失败 POST {} | error={}", url, e.getMessage());
            throw new IntegrationException("HTTP Form请求失败: " + url, e);
        }
    }

    // =====================================================
    // GET（查询接口）
    // =====================================================

    /**
     * GET 请求（带Header）
     */
    public <T> T get(String url, Class<T> responseType, Map<String, String> headers) {
        HttpHeaders httpHeaders = new HttpHeaders();
        if (headers != null) {
            headers.forEach(httpHeaders::set);
        }
        HttpEntity<Void> entity = new HttpEntity<>(httpHeaders);

        log.debug("[集成HTTP] GET {}", url);
        try {
            ResponseEntity<T> response = restTemplate.exchange(url, HttpMethod.GET, entity, responseType);
            return response.getBody();
        } catch (RestClientException e) {
            log.error("[集成HTTP] 请求失败 GET {} | error={}", url, e.getMessage());
            throw new IntegrationException("HTTP GET请求失败: " + url, e);
        }
    }

    // =====================================================
    // 集成异常
    // =====================================================

    /** 第三方集成 HTTP 异常 */
    public static class IntegrationException extends RuntimeException {
        public IntegrationException(String message, Throwable cause) {
            super(message, cause);
        }
        public IntegrationException(String message) {
            super(message);
        }
    }
}
