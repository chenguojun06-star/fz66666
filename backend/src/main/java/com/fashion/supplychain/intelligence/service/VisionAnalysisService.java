package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.entity.VisualAiLog;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import com.fashion.supplychain.intelligence.mapper.VisualAiLogMapper;
import com.fashion.supplychain.service.RedisService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * 视觉AI分析服务 — 升级后支持真实多模态模型
 *
 * 职责: 
 * 1. 接收图片URL + 分析类型，返回结构化分析结果
 * 2. Redis缓存相同图片的分析结果（7天）
 * 3. 成本和token追踪
 * 4. 置信度阈值检查（低于70%建议人工复核）
 */
@Service
@Slf4j
public class VisionAnalysisService {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String VISION_CACHE_PREFIX = "vision:cache:";
    private static final int CACHE_TTL_DAYS = 7;

    @Autowired
    private AiInferenceGateway aiInferenceGateway;

    @Autowired
    private RedisService redisService;

    @Autowired
    private VisualAiLogMapper visualAiLogMapper;

    @Value("${smart.vision.confidence-threshold:70}")
    private Integer confidenceThreshold;

    @Value("${smart.vision.real-model.enabled:false}")
    private Boolean realModelEnabled;

    public boolean isAvailable() {
        return realModelEnabled && aiInferenceGateway.isAvailable();
    }

    // ==================== 公开API ====================

    public VisionResult analyzeDefect(String imageUrl, String contextHint) {
        String prompt = buildDefectPrompt(contextHint);
        return analyze(imageUrl, prompt, "DEFECT_DETECT");
    }

    public VisionResult analyzeStyle(String imageUrl, String contextHint) {
        String prompt = buildStylePrompt(contextHint);
        return analyze(imageUrl, prompt, "STYLE_IDENTIFY");
    }

    public VisionResult analyzeColor(String imageUrl, String contextHint) {
        String prompt = buildColorPrompt(contextHint);
        return analyze(imageUrl, prompt, "COLOR_CHECK");
    }

    public VisionResult analyzeGeneric(String imageUrl, String taskDescription) {
        String prompt = "请分析这张图片。任务：" + taskDescription
                + "\n\n请返回JSON格式：{\"severity\":\"NONE|LOW|MEDIUM|HIGH|CRITICAL\","
                + "\"confidence\":0-100,\"report\":\"分析结果\",\"recommendation\":\"建议\"}";
        return analyze(imageUrl, prompt, "GENERIC");
    }

    // ==================== 核心分析逻辑 ====================

    private VisionResult analyze(String imageUrl, String textPrompt, String taskType) {
        Long tenantId = UserContext.tenantId();
        String imageHash = computeImageHash(imageUrl);
        String cacheKey = VISION_CACHE_PREFIX + tenantId + ":" + imageHash + ":" + taskType;

        // 1. 检查 Redis 缓存
        VisionResult cachedResult = redisService.get(cacheKey);
        if (cachedResult != null) {
            log.info("[VisionAnalysis] Cache hit: tenant={}, taskType={}", tenantId, taskType);
            return cachedResult;
        }

        VisionResult result;
        if (realModelEnabled && aiInferenceGateway.isAvailable()) {
            // 2. 真实视觉模型调用
            result = callRealVisionModel(imageUrl, textPrompt, taskType, tenantId);
        } else {
            // 3. 降级逻辑：原有的模拟或 Legacy 调用（暂时保留兼容）
            result = callLegacyVisionModel(imageUrl, textPrompt, taskType, tenantId);
        }

        // 4. 缓存结果
        redisService.set(cacheKey, result, CACHE_TTL_DAYS, TimeUnit.DAYS);

        // 5. 保存日志
        saveVisionLog(tenantId, imageUrl, taskType, result);

        return result;
    }

    private VisionResult callRealVisionModel(String imageUrl, String textPrompt, String taskType, Long tenantId) {
        try {
            IntelligenceInferenceResult inferenceResult = aiInferenceGateway.chatWithVision(
                "vision-analysis",
                "你是服装生产质检专家，请精确分析图片并返回严格的JSON格式。",
                textPrompt,
                imageUrl
            );

            if (inferenceResult == null || !inferenceResult.isSuccess()) {
                log.warn("[VisionAnalysis] Real model failed: {}", inferenceResult != null ? inferenceResult.getErrorMessage() : "null result");
                return VisionResult.error("视觉模型调用失败：" + (inferenceResult != null ? inferenceResult.getErrorMessage() : "未知错误"));
            }

            String rawResponse = inferenceResult.getContent();
            VisionResult result = parseVisionResponse(rawResponse, taskType);
            result.setRawResponse(rawResponse);
            // 暂时不设置 cost，因为 IntelligenceInferenceResult 没有该字段
            result.setTokens(inferenceResult.getPromptTokens() + inferenceResult.getCompletionTokens());

            // 置信度检查
            if (result.getConfidence() < confidenceThreshold) {
                result.setNeedManualReview(true);
                log.info("[VisionAnalysis] Low confidence result ({} < {}), marked for review", result.getConfidence(), confidenceThreshold);
            }

            return result;
        } catch (Exception e) {
            log.error("[VisionAnalysis] Real model call exception: {}", e.getMessage(), e);
            return VisionResult.error("视觉模型调用异常：" + e.getMessage());
        }
    }

    private VisionResult callLegacyVisionModel(String imageUrl, String textPrompt, String taskType, Long tenantId) {
        // 暂时保持原有的模拟逻辑作为降级方案
        // 这里可以直接保留原有的 IntelligenceInferenceOrchestrator 调用
        return VisionResult.unavailable("真实视觉模型未启用，请联系管理员配置");
    }

    // ==================== 图片哈希计算 ====================

    private String computeImageHash(String imageUrl) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(imageUrl.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hashBytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            log.warn("[VisionAnalysis] SHA-256 not available, fallback to simple hash");
            return String.valueOf(imageUrl.hashCode());
        }
    }

    // ==================== 日志保存 ====================

    private void saveVisionLog(Long tenantId, String imageUrl, String taskType, VisionResult result) {
        try {
            VisualAiLog logEntity = new VisualAiLog();
            logEntity.setTenantId(tenantId);
            logEntity.setImageUrl(imageUrl);
            logEntity.setTaskType(taskType);
            logEntity.setSeverity(result.getSeverity());
            logEntity.setConfidence(result.getConfidence());
            logEntity.setStatus(result.isAvailable() && result.getErrorMessage() == null ? "DONE" : "FAILED");
            if (result.getDefects() != null && !result.getDefects().isEmpty()) {
                logEntity.setDetectedItems(MAPPER.writeValueAsString(result.getDefects()));
            }
            logEntity.setCreateTime(java.time.LocalDateTime.now());
            visualAiLogMapper.insert(logEntity);
        } catch (Exception e) {
            log.warn("[VisionAnalysis] Failed to save vision log: {}", e.getMessage());
        }
    }

    // ==================== Prompt 构建 ====================

    private String buildDefectPrompt(String contextHint) {
        StringBuilder sb = new StringBuilder();
        sb.append("你是服装质检AI专家。请仔细分析这张服装/布料图片，检测缺陷。\n\n");
        sb.append("检测项目：破洞、污渍、色差、线头、跳针、漏针、起毛、褶皱、尺寸偏差、印花偏移\n\n");
        if (contextHint != null && !contextHint.isBlank()) {
            sb.append("额外上下文：").append(contextHint).append("\n\n");
        }
        sb.append("返回JSON格式（严格JSON，不要markdown包裹）：\n");
        sb.append("{\"severity\":\"NONE|LOW|MEDIUM|HIGH|CRITICAL\",");
        sb.append("\"confidence\":0-100,");
        sb.append("\"defects\":[{\"type\":\"缺陷类型\",\"description\":\"具体描述\",\"level\":\"LOW|MEDIUM|HIGH\",\"location\":\"图片中的位置\"}],");
        sb.append("\"report\":\"综合评价\",\"recommendation\":\"处理建议\"}");
        return sb.toString();
    }

    private String buildStylePrompt(String contextHint) {
        StringBuilder sb = new StringBuilder();
        sb.append("你是服装款式分析AI专家。请分析这张服装图片的款式特征。\n\n");
        sb.append("分析维度：领型、袖型、版型、长度、面料质感、颜色、图案、风格、适用季节\n\n");
        if (contextHint != null && !contextHint.isBlank()) {
            sb.append("额外上下文：").append(contextHint).append("\n\n");
        }
        sb.append("返回JSON格式（严格JSON，不要markdown包裹）：\n");
        sb.append("{\"severity\":\"NONE\",\"confidence\":0-100,");
        sb.append("\"defects\":[{\"type\":\"款式特征\",\"description\":\"具体描述\",\"level\":\"LOW\",\"location\":\"\"}],");
        sb.append("\"report\":\"款式特征总结\",\"recommendation\":\"生产/设计建议\"}");
        return sb.toString();
    }

    private String buildColorPrompt(String contextHint) {
        StringBuilder sb = new StringBuilder();
        sb.append("你是服装色差检测AI专家。请分析这张图片的色差/色牢度问题。\n\n");
        sb.append("检测项目：整体色差、局部色差、色牢度、染色均匀度、与标准色卡对比\n\n");
        if (contextHint != null && !contextHint.isBlank()) {
            sb.append("额外上下文：").append(contextHint).append("\n\n");
        }
        sb.append("返回JSON格式（严格JSON，不要markdown包裹）：\n");
        sb.append("{\"severity\":\"NONE|LOW|MEDIUM|HIGH|CRITICAL\",\"confidence\":0-100,");
        sb.append("\"defects\":[{\"type\":\"色差类型\",\"description\":\"具体描述\",\"level\":\"LOW|MEDIUM|HIGH\",\"location\":\"图片中的位置\"}],");
        sb.append("\"report\":\"色差评价\",\"recommendation\":\"处理建议\"}");
        return sb.toString();
    }

    // ==================== 响应解析 ====================

    private VisionResult parseVisionResponse(String raw, String taskType) {
        VisionResult result = new VisionResult();
        result.setTaskType(taskType);

        try {
            // 尝试解析 JSON
            int jsonStart = raw.indexOf('{');
            int jsonEnd = raw.lastIndexOf('}');
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
                String jsonStr = raw.substring(jsonStart, jsonEnd + 1);
                Map<String, Object> jsonMap = MAPPER.readValue(jsonStr, Map.class);

                result.setSeverity(extractString(jsonMap, "severity", "NONE"));
                result.setConfidence(extractInt(jsonMap, "confidence", 0));
                result.setReport(extractString(jsonMap, "report", raw));
                result.setRecommendation(extractString(jsonMap, "recommendation", "请人工复核"));

                Object defectsObj = jsonMap.get("defects");
                if (defectsObj instanceof List) {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> defectsList = (List<Map<String, Object>>) defectsObj;
                    result.setDefects(defectsList);
                }
            } else {
                // JSON 解析失败，直接返回原始内容
                result.setReport(raw);
                result.setConfidence(0);
                result.setSeverity("NONE");
            }
        } catch (Exception e) {
            log.warn("[VisionAnalysis] Response parse exception: {}", e.getMessage());
            result.setReport(raw);
            result.setConfidence(0);
            result.setSeverity("NONE");
        }

        return result;
    }

    private String extractString(Map<String, Object> map, String key, String defaultValue) {
        Object val = map.get(key);
        return val != null ? val.toString() : defaultValue;
    }

    private int extractInt(Map<String, Object> map, String key, int defaultValue) {
        Object val = map.get(key);
        if (val instanceof Number) {
            return ((Number) val).intValue();
        } else if (val instanceof String) {
            try {
                return Integer.parseInt(val.toString().replaceAll("[^0-9]", ""));
            } catch (Exception e) {
                return defaultValue;
            }
        }
        return defaultValue;
    }

    // ==================== 结果DTO ====================

    public static class VisionResult {
        private String taskType;
        private String severity = "NONE";
        private int confidence;
        private String report;
        private String recommendation;
        private String rawResponse;
        private List<Map<String, Object>> defects = new ArrayList<>();
        private boolean available = true;
        private String errorMessage;
        private boolean needManualReview = false;
        private Double cost;
        private Integer tokens;

        public static VisionResult unavailable(String msg) {
            VisionResult r = new VisionResult();
            r.available = false;
            r.errorMessage = msg;
            r.confidence = 0;
            r.severity = "NONE";
            r.report = msg;
            return r;
        }

        public static VisionResult error(String msg) {
            VisionResult r = new VisionResult();
            r.available = true;
            r.errorMessage = msg;
            r.confidence = 0;
            r.severity = "NONE";
            r.report = msg;
            return r;
        }

        // Getters and Setters
        public String getTaskType() { return taskType; }
        public void setTaskType(String v) { this.taskType = v; }
        public String getSeverity() { return severity; }
        public void setSeverity(String v) { this.severity = v; }
        public int getConfidence() { return confidence; }
        public void setConfidence(int v) { this.confidence = v; }
        public String getReport() { return report; }
        public void setReport(String v) { this.report = v; }
        public String getRecommendation() { return recommendation; }
        public void setRecommendation(String v) { this.recommendation = v; }
        public String getRawResponse() { return rawResponse; }
        public void setRawResponse(String v) { this.rawResponse = v; }
        public List<Map<String, Object>> getDefects() { return defects; }
        public void setDefects(List<Map<String, Object>> v) { this.defects = v; }
        public boolean isAvailable() { return available; }
        public void setAvailable(boolean v) { this.available = v; }
        public String getErrorMessage() { return errorMessage; }
        public void setErrorMessage(String v) { this.errorMessage = v; }
        public boolean isNeedManualReview() { return needManualReview; }
        public void setNeedManualReview(boolean v) { this.needManualReview = v; }
        public Double getCost() { return cost; }
        public void setCost(Double v) { this.cost = v; }
        public Integer getTokens() { return tokens; }
        public void setTokens(Integer v) { this.tokens = v; }
    }
}
