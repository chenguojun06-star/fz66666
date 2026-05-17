package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 视觉AI分析服务 — 封装 Doubao Vision 多模态模型调用
 *
 * 职责：接收图片URL + 分析类型，返回结构化分析结果
 * 下游：VisualAIOrchestrator（批量视觉分析）、FileAnalysisOrchestrator（文件上传图片分析）
 */
@Service
@Slf4j
public class VisionAnalysisService {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    public boolean isAvailable() {
        return inferenceOrchestrator.isVisionEnabled();
    }

    // ==================== 公开 API ====================

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
        if (!isAvailable()) {
            return VisionResult.unavailable("DoubaoVision 未配置，请在环境变量中设置 DOUBAO_API_KEY");
        }

        String rawResponse;
        try {
            rawResponse = inferenceOrchestrator.chatWithDoubaoVision(imageUrl, textPrompt);
        } catch (Exception e) {
            log.warn("[VisionAnalysis] 视觉模型调用异常 taskType={}: {}", taskType, e.getMessage());
            return VisionResult.error("视觉模型调用失败: " + e.getMessage());
        }

        if (rawResponse == null || rawResponse.isBlank()) {
            return VisionResult.error("视觉模型返回空响应，图片可能无法识别或模型不可用");
        }

        VisionResult result = parseVisionResponse(rawResponse, taskType);
        result.setRawResponse(rawResponse);
        return result;
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
        sb.append("\"defects\":[{\"type\":\"缺陷类型\",\"description\":\"具体描述\",");
        sb.append("\"level\":\"LOW|MEDIUM|HIGH\",\"location\":\"图片中的位置\"}],");
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
        sb.append("\"defects\":[{\"type\":\"款式特征\",\"description\":\"具体描述\",");
        sb.append("\"level\":\"LOW\",\"location\":\"\"}],");
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
        sb.append("\"defects\":[{\"type\":\"色差类型\",\"description\":\"具体描述\",");
        sb.append("\"level\":\"LOW|MEDIUM|HIGH\",\"location\":\"图片中的位置\"}],");
        sb.append("\"report\":\"色差评估\",\"recommendation\":\"处理建议\"}");
        return sb.toString();
    }

    // ==================== 响应解析 ====================

    private VisionResult parseVisionResponse(String raw, String taskType) {
        VisionResult result = new VisionResult();
        result.setTaskType(taskType);

        try {
            result.setSeverity(extractJsonString(raw, "severity", "NONE"));
            result.setConfidence(extractJsonInt(raw, "confidence", 0));
            result.setReport(extractJsonString(raw, "report", raw));
            result.setRecommendation(extractJsonString(raw, "recommendation", "请人工复核"));

            List<Map<String, Object>> defects = new ArrayList<>();
            int defectStart = raw.indexOf("\"defects\"");
            if (defectStart >= 0) {
                int bracketStart = raw.indexOf('[', defectStart);
                int bracketEnd = raw.lastIndexOf(']');
                if (bracketStart >= 0 && bracketEnd > bracketStart) {
                    String defectsBlock = raw.substring(bracketStart, bracketEnd + 1);
                    try {
                        @SuppressWarnings("unchecked")
                        List<Map<String, Object>> parsed = MAPPER.readValue(defectsBlock, List.class);
                        defects = parsed;
                    } catch (Exception e) {
                        log.debug("[VisionAnalysis] defects JSON解析失败，使用简化提取: {}", e.getMessage());
                        defects = extractDefectsManual(raw);
                    }
                }
            }
            result.setDefects(defects);
        } catch (Exception e) {
            log.warn("[VisionAnalysis] 响应解析异常 taskType={}: {}", taskType, e.getMessage());
            result.setReport(raw);
            result.setConfidence(0);
            result.setSeverity("NONE");
        }

        return result;
    }

    private List<Map<String, Object>> extractDefectsManual(String raw) {
        List<Map<String, Object>> list = new ArrayList<>();
        java.util.regex.Pattern tp = java.util.regex.Pattern.compile("\"type\"\\s*:\\s*\"([^\"]+)\"");
        java.util.regex.Pattern dp = java.util.regex.Pattern.compile("\"description\"\\s*:\\s*\"([^\"]+)\"");
        java.util.regex.Pattern lp = java.util.regex.Pattern.compile("\"level\"\\s*:\\s*\"([^\"]+)\"");
        java.util.regex.Matcher tm = tp.matcher(raw);
        java.util.regex.Matcher dm = dp.matcher(raw);
        java.util.regex.Matcher lm = lp.matcher(raw);
        while (tm.find()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", tm.group(1));
            item.put("description", dm.find() ? dm.group(1) : "");
            item.put("level", lm.find() ? lm.group(1) : "LOW");
            list.add(item);
        }
        return list;
    }

    private String extractJsonString(String json, String field, String defaultVal) {
        java.util.regex.Pattern p = java.util.regex.Pattern.compile("\"" + field + "\"\\s*:\\s*\"([^\"]+)\"");
        java.util.regex.Matcher m = p.matcher(json);
        return m.find() ? m.group(1) : defaultVal;
    }

    private int extractJsonInt(String json, String field, int defaultVal) {
        try {
            String val = extractJsonString(json, field, String.valueOf(defaultVal));
            return Integer.parseInt(val.replaceAll("[^0-9]", ""));
        } catch (Exception e) {
            return defaultVal;
        }
    }

    // ==================== 结果 DTO ====================

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
    }
}