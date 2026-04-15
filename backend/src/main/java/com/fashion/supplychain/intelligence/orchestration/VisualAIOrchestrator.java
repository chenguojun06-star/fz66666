package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.VisualAIRequest;
import com.fashion.supplychain.intelligence.dto.VisualAIResponse;
import com.fashion.supplychain.intelligence.entity.VisualAiLog;
import com.fashion.supplychain.intelligence.mapper.VisualAiLogMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
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
@Slf4j
public class VisualAIOrchestrator {

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Autowired
    private VisualAiLogMapper visualAiLogMapper;

    @Autowired
    private AiAgentTraceOrchestrator traceOrchestrator;

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

        String systemPrompt = buildSystemPrompt(taskType);
        String userMsg = buildUserMessage(taskType, req.getImageUrl());

        String llmRaw;
        try {
            var result = inferenceOrchestrator.chat("visual-ai-" + taskType.toLowerCase(), systemPrompt, userMsg);
            if (commandId != null) {
                try {
                    traceOrchestrator.recordStep(commandId, "llm-vision", userMsg,
                            result.getContent(), result.getLatencyMs(), result.isSuccess());
                } catch (Exception e) { log.debug("[VisualAI] trace recordStep 失败: {}", e.getMessage()); }
            }
            if (!result.isSuccess()) {
                if (commandId != null) {
                    try { traceOrchestrator.finishRequest(commandId, null, result.getContent(), System.currentTimeMillis() - startTime); }
                    catch (Exception e) { log.debug("[VisualAI] trace finishRequest 失败: {}", e.getMessage()); }
                }
                return errorResponse("视觉AI分析失败：" + result.getContent(), req);
            }
            llmRaw = result.getContent();
        } catch (Exception e) {
            log.warn("[VisualAI] LLM call failed: {}", e.getMessage());
            if (commandId != null) {
                try { traceOrchestrator.finishRequest(commandId, null, e.getMessage(), System.currentTimeMillis() - startTime); }
                catch (Exception ex) { log.debug("[VisualAI] trace finishRequest 失败: {}", ex.getMessage()); }
            }
            return errorResponse("视觉AI服务暂时不可用", req);
        }

        VisualAIResponse resp = parseResponse(llmRaw, taskType);
        resp.setTaskType(taskType);

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
}
