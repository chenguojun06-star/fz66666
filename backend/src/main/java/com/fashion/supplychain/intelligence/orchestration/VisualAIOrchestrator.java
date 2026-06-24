package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.VisualAIRequest;
import com.fashion.supplychain.intelligence.dto.VisualAIResponse;
import com.fashion.supplychain.intelligence.entity.VisualAiLog;
import com.fashion.supplychain.intelligence.mapper.VisualAiLogMapper;
import com.fashion.supplychain.intelligence.service.QdrantService;
import com.fashion.supplychain.intelligence.service.VisionAnalysisService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Stage7 — 视觉AI Orchestrator
 * 通过 LLM 描述图片（vision multimodal prompt）进行：
 *   - DEFECT_DETECT: 布料/成品缺陷检测
 *   - STYLE_IDENTIFY: 款式特征识别
 *   - COLOR_CHECK: 色差检查
 * LLM 返回 JSON 片段，解析后持久化到 t_visual_ai_log
 */
@Service
@Lazy
@Slf4j
public class VisualAIOrchestrator {

    @Autowired
    private VisionAnalysisService visionAnalysisService;

    @Autowired
    private VisualAiLogMapper visualAiLogMapper;

    @Autowired
    private AiAgentTraceOrchestrator traceOrchestrator;

    @Autowired
    private QdrantService qdrantService;

    // ──────────────────────────────────────────────────────────────────
    // 公共入口
    // ──────────────────────────────────────────────────────────────────

    public VisualAIResponse analyze(VisualAIRequest req) {
        if (req == null || req.getImageUrl() == null || req.getImageUrl().isBlank()) {
            return errorResponse("imageUrl 不能为空", req);
        }
        String taskType = req.getTaskType() != null ? req.getTaskType().toUpperCase() : "DEFECT_DETECT";

        String commandId = null;
        long startTime = System.currentTimeMillis();
        try {
            commandId = traceOrchestrator.startRequest(
                    taskType + ":" + req.getImageUrl(), "visual-ai:request");
        } catch (Exception e) {
            log.debug("[VisualAI] trace startRequest 失败: {}", e.getMessage());
        }

        VisionAnalysisService.VisionResult visionResult;
        try {
            switch (taskType) {
                case "STYLE_IDENTIFY":
                    visionResult = visionAnalysisService.analyzeStyle(req.getImageUrl(), null);
                    break;
                case "COLOR_CHECK":
                    visionResult = visionAnalysisService.analyzeColor(req.getImageUrl(), null);
                    break;
                default:
                    visionResult = visionAnalysisService.analyzeDefect(req.getImageUrl(), null);
            }
            if (commandId != null) {
                try {
                    traceOrchestrator.recordStep(commandId, "llm-vision", req.getImageUrl(),
                            visionResult.getReport(), System.currentTimeMillis() - startTime, visionResult.getConfidence() > 0);
                } catch (Exception e) { log.debug("[VisualAI] trace recordStep 失败: {}", e.getMessage()); }
            }
            if (!visionResult.isAvailable() || visionResult.getConfidence() == 0) {
                if (commandId != null) {
                    try { traceOrchestrator.finishRequest(commandId, null, visionResult.getErrorMessage(), System.currentTimeMillis() - startTime); }
                    catch (Exception e) { log.debug("[VisualAI] trace finishRequest 失败: {}", e.getMessage()); }
                }
                return errorResponse(visionResult.getErrorMessage() != null ? visionResult.getErrorMessage() : "视觉AI分析失败", req);
            }
        } catch (Exception e) {
            log.warn("[VisualAI] Vision call failed: {}", e.getMessage());
            if (commandId != null) {
                try { traceOrchestrator.finishRequest(commandId, null, e.getMessage(), System.currentTimeMillis() - startTime); }
                catch (Exception ex) { log.debug("[VisualAI] trace finishRequest 失败: {}", ex.getMessage()); }
            }
            return errorResponse("视觉AI服务暂时不可用", req);
        }
        String llmRaw = visionResult.getRawResponse() != null ? visionResult.getRawResponse() : visionResult.getReport();

        VisualAIResponse resp = parseResponse(llmRaw, taskType);
        resp.setTaskType(taskType);

        // 以图搜款：款式识别任务完成后，自动搜索相似款式
        if ("STYLE_IDENTIFY".equals(taskType) && req.getImageUrl() != null
                && !req.getImageUrl().startsWith("data:")) {
            String similarStyles = searchSimilarStyles(req.getImageUrl());
            if (similarStyles != null) {
                resp.setRecommendation(
                        (resp.getRecommendation() != null ? resp.getRecommendation() + "\n\n" : "")
                        + similarStyles);
            }
        }

        Long logId = persistLog(req, resp);
        resp.setLogId(logId);

        if (commandId != null) {
            try {
                traceOrchestrator.finishRequest(commandId, taskType + "分析完成", null, System.currentTimeMillis() - startTime);
            } catch (Exception e) { log.debug("[VisualAI] trace finishRequest 失败: {}", e.getMessage()); }
        }
        return resp;
    }

    // ──────────────────────────────────────────────────────────────────
    // Prompt 构建
    // ──────────────────────────────────────────────────────────────────

    private String buildSystemPrompt(String taskType) {
        switch (taskType) {
            case "DEFECT_DETECT":
                return "你是服装质检AI。请根据用户提供的图片URL进行缺陷分析。" +
                       "如果无法看到图片或图片不可用，必须将confidence设为0并在report中说明。" +
                       "返回JSON格式的缺陷报告：{\"severity\":\"NONE|LOW|MEDIUM|HIGH|CRITICAL\"," +
                       "\"confidence\":0-100,\"defects\":[{\"type\":\"缺陷类型\",\"description\":\"描述\"," +
                       "\"level\":\"LOW|MEDIUM|HIGH\",\"location\":\"位置描述\"}]," +
                       "\"report\":\"综合评价\",\"recommendation\":\"处理建议\"}";
            case "STYLE_IDENTIFY":
                return "你是服装款式识别AI。当用户提供图片URL时，分析款式特征，" +
                       "返回JSON：{\"severity\":\"NONE\",\"confidence\":0-100," +
                       "\"defects\":[{\"type\":\"特征\",\"description\":\"描述\",\"level\":\"LOW\",\"location\":\"\"}]," +
                       "\"report\":\"款式特征摘要\",\"recommendation\":\"款式建议\"}";
            case "COLOR_CHECK":
                return "你是服装色差检测AI。当用户提供图片URL时，检测色差/色牢度问题，" +
                       "返回JSON：{\"severity\":\"NONE|LOW|MEDIUM|HIGH|CRITICAL\"," +
                       "\"confidence\":0-100," +
                       "\"defects\":[{\"type\":\"色差类型\",\"description\":\"描述\"," +
                       "\"level\":\"LOW|MEDIUM|HIGH\",\"location\":\"位置\"}]," +
                       "\"report\":\"色差报告\",\"recommendation\":\"处理建议\"}";
            default:
                return "你是服装AI质检系统，返回JSON格式分析报告。";
        }
    }

    private String buildUserMessage(String taskType, String imageUrl) {
        return "请分析以下图片（URL: " + imageUrl + "）进行" +
               taskTypeName(taskType) + "，按要求格式返回JSON。";
    }

    private String taskTypeName(String t) {
        switch (t) {
            case "DEFECT_DETECT": return "缺陷检测";
            case "STYLE_IDENTIFY": return "款式识别";
            case "COLOR_CHECK": return "色差检测";
            default: return "图像分析";
        }
    }

    // ──────────────────────────────────────────────────────────────────
    // JSON 解析（宽容型，LLM 返回不一定严格 JSON）
    // ──────────────────────────────────────────────────────────────────

    private VisualAIResponse parseResponse(String raw, String taskType) {
        VisualAIResponse resp = new VisualAIResponse();
        resp.setReport(raw);
        resp.setDataSource("ai_vision");
        if (resp.getConfidence() != null && resp.getConfidence() == 0) {
            resp.setDataSource("ai_no_image");
        }

        // 提取 severity
        resp.setSeverity(extractField(raw, "severity", "NONE"));

        // 提取 confidence
        try {
            String confStr = extractField(raw, "confidence", "0");
            resp.setConfidence(Integer.parseInt(confStr.replaceAll("[^0-9]", "")));
        } catch (Exception e) {
            resp.setConfidence(0);
        }

        // 提取 recommendation
        resp.setRecommendation(extractField(raw, "recommendation", "请人工复核"));

        // 简化 defects 解析（提取 type + description 对）
        resp.setDetectedItems(parseDefects(raw));
        return resp;
    }

    private String extractField(String json, String field, String defaultVal) {
        Pattern p = Pattern.compile("\"" + field + "\"\\s*:\\s*\"([^\"]+)\"");
        Matcher m = p.matcher(json);
        return m.find() ? m.group(1) : defaultVal;
    }

    private List<VisualAIResponse.DetectedItem> parseDefects(String raw) {
        List<VisualAIResponse.DetectedItem> list = new ArrayList<>();
        Pattern tp = Pattern.compile("\"type\"\\s*:\\s*\"([^\"]+)\"");
        Pattern dp = Pattern.compile("\"description\"\\s*:\\s*\"([^\"]+)\"");
        Pattern lp = Pattern.compile("\"level\"\\s*:\\s*\"([^\"]+)\"");
        Matcher tm = tp.matcher(raw);
        Matcher dm = dp.matcher(raw);
        Matcher lm = lp.matcher(raw);
        while (tm.find()) {
            VisualAIResponse.DetectedItem item = new VisualAIResponse.DetectedItem();
            item.setType(tm.group(1));
            if (dm.find()) item.setDescription(dm.group(1));
            if (lm.find()) item.setLevel(lm.group(1));
            item.setConfidence(0);
            list.add(item);
        }
        return list;
    }

    // ──────────────────────────────────────────────────────────────────
    // 持久化
    // ──────────────────────────────────────────────────────────────────

    private Long persistLog(VisualAIRequest req, VisualAIResponse resp) {
        try {
            VisualAiLog log2 = new VisualAiLog();
            log2.setTenantId(UserContext.tenantId());
            log2.setOrderId(req.getOrderId());
            log2.setImageUrl(req.getImageUrl());
            log2.setTaskType(req.getTaskType());
            log2.setSeverity(resp.getSeverity());
            log2.setConfidence(resp.getConfidence());
            log2.setStatus("DONE");
            log2.setCreateTime(LocalDateTime.now());
            visualAiLogMapper.insert(log2);
            return log2.getId();
        } catch (Exception ex) {
            log.warn("[VisualAI] persist failed: {}", ex.getMessage());
            return null;
        }
    }

    private VisualAIResponse errorResponse(String msg, VisualAIRequest req) {
        VisualAIResponse r = new VisualAIResponse();
        r.setReport(msg);
        r.setSeverity("NONE");
        r.setConfidence(0);
        r.setTaskType(req != null ? req.getTaskType() : "UNKNOWN");
        r.setDetectedItems(new ArrayList<>());
        return r;
    }

    /**
     * 以图搜款（不依赖向量数据库）：Agnes 识别图片 → 生成文字描述 → MySQL 关键词搜索
     * 之前依赖 Qdrant，现在直接用文字搜索，效果可控且零运维
     */
    public Map<String, Object> searchSimilarStylesByImage(String imageUrl, int topK) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Map.of("success", false, "error", "tenantId 为空", "styles", new ArrayList<Map<String, Object>>());
        }
        try {
            // 1. Agnes 识别图片 → 得到款式特征文字描述
            VisionAnalysisService.StyleFieldParseResult fields = visionAnalysisService.parseStyleFields(imageUrl);
            if (fields == null || !fields.isAvailable()) {
                return Map.of("success", false, "error", "图片识别失败", "styles", new ArrayList<Map<String, Object>>());
            }

            // 2. 提取关键词（颜色/品类/面料/袖型/领型/季节）
            List<String> keywords = new ArrayList<>();
            if (fields.getColors() != null && !fields.getColors().isEmpty()) {
                keywords.addAll(fields.getColors());
            }
            if (fields.getCategory() != null && !fields.getCategory().isBlank()) keywords.add(fields.getCategory());
            if (fields.getFabric() != null && !fields.getFabric().isBlank()) keywords.add(fields.getFabric());
            if (fields.getSleeveType() != null && !fields.getSleeveType().isBlank()) keywords.add(fields.getSleeveType());
            if (fields.getNeckline() != null && !fields.getNeckline().isBlank()) keywords.add(fields.getNeckline());
            if (fields.getSeason() != null && !fields.getSeason().isBlank()) keywords.add(fields.getSeason());
            if (fields.getPattern() != null && !fields.getPattern().isBlank()) keywords.add(fields.getPattern());

            if (keywords.isEmpty()) {
                // 关键词过少，用综合描述兜底
                String summary = fields.getSummary() != null ? fields.getSummary() : "";
                return Map.of("success", false, "error", "无法从图片中提取有效特征", "recognizedSummary", summary, "styles", new ArrayList<Map<String, Object>>());
            }

            // 3. MySQL 关键词搜索（LIKE + OR，性能可控，因为只查 style_no/style_name/category/season/color/description/image_insight 等字段）
            List<Map<String, Object>> styles = visualAiLogMapper.searchSimilarStylesByKeywords(
                tenantId,
                keywords,
                topK
            );

            // 4. 将 match_score 转成百分比格式 similarity（与前端字段对齐）
            int totalKeywords = keywords.size();
            List<Map<String, Object>> matches = new ArrayList<>();
            for (Map<String, Object> s : styles) {
                Map<String, Object> item = new java.util.LinkedHashMap<>();
                item.put("styleNo", s.get("styleNo"));
                item.put("styleName", s.get("styleName"));
                item.put("difficultyLevel", s.get("difficultyLevel"));
                Object ds = s.get("difficultyScore");
                item.put("difficultyScore", ds != null ? String.valueOf(ds) : null);
                // 计算相似度百分比（match_score / 关键词数 * 100）
                Object scoreObj = s.get("matchScore");
                int score = scoreObj instanceof Number ? ((Number) scoreObj).intValue() : 0;
                int pct = totalKeywords > 0 ? Math.min(100, (int) Math.round(score * 100.0 / totalKeywords)) : 0;
                item.put("similarity", String.valueOf(pct) + "%");
                item.put("cover", s.get("cover"));
                matches.add(item);
            }

            Map<String, Object> result = new java.util.LinkedHashMap<>();
            result.put("success", true);
            result.put("recognizedTags", keywords);
            result.put("recognizedSummary", fields.getSummary() != null ? fields.getSummary() : "");
            result.put("styleNameSuggestion", fields.getStyleName() != null ? fields.getStyleName() : "");
            result.put("matchCount", matches.size());
            result.put("matches", matches);
            return result;
        } catch (Exception e) {
            log.warn("[VisualAI] 以图搜款异常: {}", e.getMessage(), e);
            return Map.of("success", false, "error", e.getMessage(), "matches", new ArrayList<Map<String, Object>>(), "matchCount", 0);
        }
    }

    private String searchSimilarStyles(String imageUrl) {
        // 旧的 analyze() 流程用这个方法，返回格式化文本；复用新方法
        if (imageUrl == null || imageUrl.isBlank() || imageUrl.startsWith("data:")) return null;
        Map<String, Object> r = searchSimilarStylesByImage(imageUrl, 3);
        if (Boolean.FALSE.equals(r.get("success"))) return null;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> matches = (List<Map<String, Object>>) r.get("matches");
        if (matches == null || matches.isEmpty()) return null;
        StringBuilder sb = new StringBuilder();
        sb.append("以图搜款匹配结果：\n");
        for (int i = 0; i < Math.min(3, matches.size()); i++) {
            Map<String, Object> s = matches.get(i);
            sb.append(i + 1).append(". 款号：").append(s.get("styleNo"));
            sb.append(" | 款名：").append(s.get("styleName"));
            sb.append(" | 难度：").append(s.get("difficultyScore")).append("/10");
            sb.append(" | 相似度：").append(s.get("similarity"));
            sb.append("\n");
        }
        return sb.toString();
    }

    /**
     * 样衣图片结构化字段解析：返回款名建议、颜色列表、品类、季节、图案、面料、袖型、领型、版型。
     */
    public VisionAnalysisService.StyleFieldParseResult parseStyleFields(String imageUrl) {
        long startTime = System.currentTimeMillis();
        try {
            return visionAnalysisService.parseStyleFields(imageUrl);
        } catch (Exception e) {
            log.warn("[VisualAI] parseStyleFields 异常: {}", e.getMessage(), e);
            VisionAnalysisService.StyleFieldParseResult r = new VisionAnalysisService.StyleFieldParseResult();
            r.setAvailable(false);
            r.setErrorMessage("识别异常：" + e.getMessage());
            return r;
        } finally {
            log.info("[VisualAI] parseStyleFields 耗时: {}ms", System.currentTimeMillis() - startTime);
        }
    }

    /**
     * 发票/收据/采购单据 OCR 结构化解析：返回金额、日期、发票号、开票单位、费用类型、税率等。
     */
    public VisionAnalysisService.ReceiptParseResult parseReceipt(String imageUrl) {
        long startTime = System.currentTimeMillis();
        try {
            return visionAnalysisService.parseReceipt(imageUrl);
        } catch (Exception e) {
            log.warn("[VisualAI] parseReceipt 异常: {}", e.getMessage(), e);
            VisionAnalysisService.ReceiptParseResult r = new VisionAnalysisService.ReceiptParseResult();
            r.setAvailable(false);
            r.setErrorMessage("识别异常：" + e.getMessage());
            return r;
        } finally {
            log.info("[VisualAI] parseReceipt 耗时: {}ms", System.currentTimeMillis() - startTime);
        }
    }

    /**
     * 尺寸表图片识别：提取 S/M/L/XL 等尺码对应的胸围/腰围/臀围/衣长/袖长/肩宽等数据。
     */
    public VisionAnalysisService.SizeChartParseResult parseSizeChart(String imageUrl) {
        long startTime = System.currentTimeMillis();
        try {
            return visionAnalysisService.parseSizeChart(imageUrl);
        } catch (Exception e) {
            log.warn("[VisualAI] parseSizeChart 异常: {}", e.getMessage(), e);
            VisionAnalysisService.SizeChartParseResult r = new VisionAnalysisService.SizeChartParseResult();
            r.setAvailable(false);
            r.setErrorMessage("识别异常：" + e.getMessage());
            return r;
        } finally {
            log.info("[VisualAI] parseSizeChart 耗时: {}ms", System.currentTimeMillis() - startTime);
        }
    }

    /**
     * BOM清单/工艺单图片识别：提取物料名称、规格、用量等。
     */
    public VisionAnalysisService.BomExtractResult parseBomExtract(String imageUrl) {
        long startTime = System.currentTimeMillis();
        try {
            return visionAnalysisService.parseBomExtract(imageUrl);
        } catch (Exception e) {
            log.warn("[VisualAI] parseBomExtract 异常: {}", e.getMessage(), e);
            VisionAnalysisService.BomExtractResult r = new VisionAnalysisService.BomExtractResult();
            r.setAvailable(false);
            r.setErrorMessage("识别异常：" + e.getMessage());
            return r;
        } finally {
            log.info("[VisualAI] parseBomExtract 耗时: {}ms", System.currentTimeMillis() - startTime);
        }
    }
}
