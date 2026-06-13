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
import org.springframework.context.annotation.Lazy;

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
@Lazy
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

    // ==================== 样衣图片结构化解析（自动填充表单用） ====================

    /**
     * 从样衣设计稿/图片中提取结构化字段，供前端自动填充表单。
     *
     * 识别字段：
     *   styleName    - 款名建议（如"藏青色长袖衬衫"）
     *   colors       - 颜色列表（如: ["黑色","白色"]）
     *   category     - 品类（如: T恤/衬衫/裤子/连衣裙/外套/卫衣）
     *   season       - 季节（春/夏/秋/冬）
     *   pattern      - 图案/花纹（如: 纯色/条纹/格子/印花/绣花）
     *   fabric       - 面料描述（如: 棉/针织/牛仔/真丝/羊毛）
     *   sleeveType   - 袖型（长袖/短袖/七分/无袖）
     *   neckline     - 领型（圆领/V领/立领/POLO领）
     *   version      - 版型（修身/宽松/直筒/常规）
     *   summary      - 综合描述，建议写入备注
     */
    public StyleFieldParseResult parseStyleFields(String imageUrl) {
        StyleFieldParseResult r = new StyleFieldParseResult();
        r.setImageUrl(imageUrl);

        // 是否可用真实模型
        if (!isAvailable()) {
            r.setAvailable(false);
            r.setErrorMessage("视觉AI模型未启用，请联系管理员配置");
            return r;
        }

        // 1) 款式特征分析
        VisionResult style = analyzeStyle(imageUrl, "重点识别：颜色主调、品类、季节、图案、面料质感、袖型、领型、版型");
        // 2) 颜色专向分析
        VisionResult color = analyzeColor(imageUrl, "识别图片中的所有可见颜色，并按出现面积排序，主色在前。");

        r.setStyleConfidence(style.getConfidence());
        r.setColorConfidence(color.getConfidence());
        r.setAvailable(style.isAvailable() || color.isAvailable());

        // 从 defects 列表提取特征 —— defects[i] 结构: { type, description, level, location }
        // type 可能是 "款式特征"、"颜色"、"面料" 等中文；description 是具体描述
        List<Map<String, Object>> allFeatures = new ArrayList<>();
        if (style.getDefects() != null) allFeatures.addAll(style.getDefects());
        if (color.getDefects() != null) allFeatures.addAll(color.getDefects());

        for (Map<String, Object> f : allFeatures) {
            String type = str(f.get("type"), "").trim();
            String desc = str(f.get("description"), "").trim();
            if (type.isBlank() && desc.isBlank()) continue;

            // 按关键词匹配字段
            if (type.contains("颜色") || type.contains("主色") || type.contains("配色")
                    || desc.matches(".*(黑色|白色|灰色|红色|粉色|蓝色|绿色|黄色|橙色|紫色|棕色|米色|驼色|藏青|杏色|卡其|米白).*")) {
                r.addColor(normalizeColor(desc.isBlank() ? type : desc));
            } else if (type.contains("品类") || type.contains("类别") || type.contains("服装类型")
                    || desc.matches(".*(T恤|衬衫|裤|裙|连衣裙|外套|大衣|卫衣|毛衣|夹克|西装|马甲|POLO|背心).*")) {
                r.setCategory(pickCategory(desc.isBlank() ? type : desc));
            } else if (type.contains("季节") || type.contains("适用季节")
                    || desc.matches(".*(春|夏|秋|冬|四季|春秋).*")) {
                r.setSeason(pickSeason(desc.isBlank() ? type : desc));
            } else if (type.contains("图案") || type.contains("花纹") || type.contains("印花")
                    || desc.matches(".*(纯色|条纹|格子|格纹|印花|绣花|提花|波点|动物纹|字母|logo).*")) {
                r.setPattern(desc.isBlank() ? type : desc);
            } else if (type.contains("面料") || type.contains("材质") || type.contains("布料")
                    || desc.matches(".*(棉|麻|丝|羊毛|针织|牛仔|涤纶|呢|绒|皮革|雪纺).*")) {
                r.setFabric(desc.isBlank() ? type : desc);
            } else if (type.contains("袖型") || type.contains("袖长")
                    || desc.matches(".*(长袖|短袖|七分袖|五分袖|无袖|中袖).*")) {
                r.setSleeveType(desc.isBlank() ? type : desc);
            } else if (type.contains("领型") || type.contains("领口")
                    || desc.matches(".*(圆领|V领|立领|POLO|翻领|衬衫领|方领|一字领|吊带).*")) {
                r.setNeckline(desc.isBlank() ? type : desc);
            } else if (type.contains("版型") || type.contains("廓形")
                    || desc.matches(".*(修身|宽松|直筒|常规|oversize|H型|A字|收腰).*")) {
                r.setVersion(desc.isBlank() ? type : desc);
            }
        }

        // 综合 report 用作 fallback（defects 为空时，report 仍有文字描述）
        String report = (style.getReport() != null ? style.getReport() : "")
                + (color.getReport() != null ? "；颜色：" + color.getReport() : "");

        // 缺陷/关键词兜底填充（从 report 文本提取）
        fillFromReport(r, report);

        // 款名建议
        if (r.getStyleName() == null || r.getStyleName().isBlank()) {
            StringBuilder sb = new StringBuilder();
            if (r.getColors().size() > 0) sb.append(String.join("/", r.getColors().subList(0, Math.min(2, r.getColors().size()))));
            if (r.getSleeveType() != null) sb.append(r.getSleeveType());
            if (r.getCategory() != null) sb.append(r.getCategory());
            r.setStyleName(sb.length() > 0 ? sb.toString() : "");
        }

        // 备注
        StringBuilder remark = new StringBuilder();
        remark.append("AI识别【").append(r.getStyleName()).append("】｜");
        remark.append("颜色：").append(String.join(",", r.getColors())).append("｜");
        if (r.getPattern() != null) remark.append("图案：").append(r.getPattern()).append("｜");
        if (r.getFabric() != null) remark.append("面料：").append(r.getFabric()).append("｜");
        if (r.getSleeveType() != null) remark.append("袖型：").append(r.getSleeveType()).append("｜");
        if (r.getNeckline() != null) remark.append("领型：").append(r.getNeckline()).append("｜");
        if (r.getVersion() != null) remark.append("版型：").append(r.getVersion()).append("｜");
        r.setSummary(remark.toString());

        // 整体置信度（取两个较低的一个，保守）
        int minConf = Math.min(style.getConfidence(), color.getConfidence());
        r.setOverallConfidence(minConf);

        // 低置信度提示人工复核
        if (minConf < 70) {
            r.setNeedManualReview(true);
            r.setReviewHint("识别置信度较低（" + minConf + "/100），请人工复核后再保存。");
        }

        log.info("[VisionAnalysis] parseStyleFields done: imageUrl={}, colors={}, category={}, season={}, confidence={}",
                imageUrl, r.getColors(), r.getCategory(), r.getSeason(), r.getOverallConfidence());
        return r;
    }

    private String str(Object o, String def) {
        return o == null ? def : o.toString();
    }

    private String normalizeColor(String raw) {
        if (raw == null || raw.isBlank()) return "";
        // 去掉无意义的描述词，保留颜色本体
        String s = raw
                .replaceAll("(?i)主色|配色|辅色|整体|服装|主色调|配色方案|色", "")
                .replaceAll("[，,。.！!？?：:；;\\s]+", "")
                .trim();
        // 常见颜色归一化
        java.util.Map<String, String> map = new java.util.LinkedHashMap<>();
        map.put("黑色", "black"); map.put("白色", "white"); map.put("灰色", "gray");
        map.put("红色", "red"); map.put("粉色", "pink"); map.put("蓝色", "blue");
        map.put("绿色", "green"); map.put("黄色", "yellow"); map.put("橙色", "orange");
        map.put("紫色", "purple"); map.put("棕色", "brown"); map.put("米色", "beige");
        map.put("驼色", "camel"); map.put("藏青", "navy"); map.put("藏青色", "navy");
        map.put("杏色", "apricot"); map.put("卡其", "khaki"); map.put("米白", "off-white");
        map.put("卡其色", "khaki"); map.put("军绿", "army"); map.put("咖啡色", "coffee");
        map.put("深蓝色", "navy"); map.put("浅蓝色", "light-blue"); map.put("深灰色", "dark-gray");
        map.put("浅灰色", "light-gray"); map.put("暗红色", "dark-red");
        for (java.util.Map.Entry<String, String> e : map.entrySet()) {
            if (s.contains(e.getKey())) return e.getKey();
        }
        return s.length() > 8 ? s.substring(0, 8) : s;
    }

    private String pickCategory(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String[] candidates = {"T恤","衬衫","裤子","牛仔裤","短裤","连衣裙","半身裙","外套","大衣","卫衣","毛衣","针织衫","夹克","西装","马甲","POLO衫","背心","卫衣","运动裤"};
        for (String c : candidates) if (raw.contains(c)) return c;
        return raw.length() > 20 ? raw.substring(0, 20) : raw;
    }

    private String pickSeason(String raw) {
        if (raw == null || raw.isBlank()) return null;
        if (raw.contains("夏")) return "夏";
        if (raw.contains("冬")) return "冬";
        if (raw.contains("春")) return "春";
        if (raw.contains("秋")) return "秋";
        if (raw.contains("春秋") || raw.contains("四季")) return "春秋";
        return null;
    }

    /** 从文本 report 中做最后一轮兜底填充 */
    private void fillFromReport(StyleFieldParseResult r, String report) {
        if (report == null || report.isBlank()) return;
        if (r.getColors().isEmpty()) {
            String[] colorKeys = {"黑色","白色","灰色","红色","粉色","蓝色","绿色","黄色","橙色","紫色","棕色","米色","驼色","藏青","杏色","卡其","米白"};
            for (String c : colorKeys) if (report.contains(c)) r.addColor(c);
        }
        if (r.getCategory() == null) {
            String[] catKeys = {"T恤","衬衫","裤子","牛仔裤","连衣裙","半身裙","外套","大衣","卫衣","毛衣","夹克","西装","POLO衫"};
            for (String c : catKeys) if (report.contains(c)) { r.setCategory(c); break; }
        }
        if (r.getSeason() == null) {
            String[] sKeys = {"夏季","春夏","冬季","秋冬","春秋","春装","夏装","秋装","冬装"};
            for (String s : sKeys) if (report.contains(s)) { r.setSeason(s.replace("季", "").replace("装", "")); break; }
        }
    }

    /**
     * 样衣图片结构化解析结果
     */
    @lombok.Data
    public static class StyleFieldParseResult {
        private String imageUrl;
        private boolean available = true;
        private String errorMessage;
        private int overallConfidence;
        private int styleConfidence;
        private int colorConfidence;
        private boolean needManualReview;
        private String reviewHint;

        /** 款名建议 */
        private String styleName;
        /** 识别到的颜色列表 */
        private java.util.List<String> colors = new ArrayList<>();
        /** 品类（如: T恤/衬衫/裤子/连衣裙） */
        private String category;
        /** 季节（春/夏/秋/冬） */
        private String season;
        /** 图案/花纹 */
        private String pattern;
        /** 面料描述 */
        private String fabric;
        /** 袖型 */
        private String sleeveType;
        /** 领型 */
        private String neckline;
        /** 版型 */
        private String version;
        /** 综合描述（建议写入备注） */
        private String summary;

        public void addColor(String c) {
            if (c == null || c.isBlank()) return;
            if (colors.size() >= 5) return;
            if (colors.contains(c)) return;
            colors.add(c);
        }
    }
}
