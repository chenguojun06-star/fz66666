package com.fashion.supplychain.production.orchestration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.service.VisionAnalysisService;
import com.fashion.supplychain.production.dto.MaterialColorCardRecognitionResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 物料色卡识别 Orchestrator
 *
 * 流程：前端上传色卡图片 → 调用多模态视觉模型 → 解析 JSON → 结构化返回 → 前端自动填充表单
 *
 * 设计原则：
 * - 任何时候失败都返回 {success: false, errorMessage: "..."}，不会抛异常到前端
 * - 置信度 < 70 的字段不会自动填充，需用户确认
 * - 物料类型归一化：优先映射到 fabric/lining/accessory
 */
@Service
@Lazy
@Slf4j
public class MaterialColorCardOrchestrator {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int CONFIDENCE_THRESHOLD = 70;
    private static final String TASK_TYPE_COLOR_CARD = "COLOR_CARD";

    @Autowired(required = false)
    private VisionAnalysisService visionAnalysisService;

    /**
     * 识别色卡图片，返回结构化字段
     *
     * @param imageUrl 已上传的图片 URL（必须通过 /common/upload 先上传）
     */
    public MaterialColorCardRecognitionResult recognizeFromImage(String imageUrl) {
        MaterialColorCardRecognitionResult result = new MaterialColorCardRecognitionResult();
        result.setImageUrl(imageUrl);

        if (imageUrl == null || imageUrl.isBlank()) {
            result.setErrorMessage("图片不能为空，请先上传图片");
            return result;
        }

        // 视觉模型不可用时的降级提示（不阻塞用户操作）
        if (visionAnalysisService == null || !visionAnalysisService.isAvailable()) {
            result.setErrorMessage("视觉模型暂不可用，请手动输入物料信息");
            log.warn("[ColorCard] 视觉模型不可用，返回空识别结果");
            return result;
        }

        // 构建识别 prompt
        String prompt = buildMaterialColorCardPrompt();

        try {
            // 调用视觉模型（用自定义 prompt 路径，避免 analyzeGeneric 添加额外包装）
            VisionAnalysisService.VisionResult visionResult =
                    visionAnalysisService.analyzeWithPrompt(imageUrl, prompt, TASK_TYPE_COLOR_CARD);

            if (visionResult == null || visionResult.getReport() == null) {
                result.setErrorMessage("视觉模型未返回有效结果，请重试");
                return result;
            }

            int confidence = visionResult.getConfidence(); // int 基本类型，不可能为 null
            result.setOverallConfidence(confidence);

            // 置信度过低，提示用户
            if (confidence < CONFIDENCE_THRESHOLD) {
                result.setAiHint("识别置信度较低，请仔细核对每个字段");
            }

            // 解析 report 中应该包含的 JSON
            JsonNode jsonRoot = tryExtractJsonFromReport(visionResult.getReport());
            if (jsonRoot == null || !jsonRoot.isObject()) {
                // 解析失败，但仍把原始文本作为 description 返回
                String fallbackText = truncate(visionResult.getReport(), 500);
                result.setDescription(MaterialColorCardRecognitionResult.FieldValue.ofText(
                        "AI识别: " + fallbackText, 50, fallbackText));
                result.setSuccess(true);
                result.setAiHint(result.getAiHint() == null
                        ? "识别结果未完全结构化，建议核对后手动输入关键信息"
                        : result.getAiHint());
                return result;
            }

            // 填充字段
            result.setMaterialName(extractField(jsonRoot, "materialName", "物料名称"));
            result.setColor(extractField(jsonRoot, "color", "颜色"));
            result.setFabricWidth(extractField(jsonRoot, "fabricWidth", "幅宽"));
            result.setFabricWeight(extractField(jsonRoot, "fabricWeight", "克重"));
            result.setFabricComposition(extractField(jsonRoot, "fabricComposition", "成分"));
            result.setSpecifications(extractField(jsonRoot, "specifications", "规格"));
            result.setUnit(extractField(jsonRoot, "unit", "单位"));
            result.setSupplierName(extractField(jsonRoot, "supplierName", "供应商"));
            result.setStyleNo(extractField(jsonRoot, "styleNo", "款号"));
            result.setDescription(extractField(jsonRoot, "description", "备注"));

            // 单价：可能是数值字段
            MaterialColorCardRecognitionResult.FieldValue priceField =
                    extractNumberField(jsonRoot, "unitPrice", "单价");
            result.setUnitPrice(priceField);

            // 物料类型：归一化
            MaterialColorCardRecognitionResult.FieldValue typeField =
                    extractField(jsonRoot, "materialType", "物料类型");
            if (typeField != null && typeField.getTextValue() != null) {
                String normalizedType = normalizeMaterialType(typeField.getTextValue());
                typeField.setTextValue(normalizedType);
            }
            result.setMaterialType(typeField);

            result.setSuccess(true);
            return result;

        } catch (Exception e) {
            log.error("[ColorCard] 识别失败: {}", e.getMessage(), e);
            result.setErrorMessage("识别失败，请检查图片或稍后重试（" + e.getMessage() + "）");
            return result;
        }
    }

    // ============ 辅助方法 ============

    private String buildMaterialColorCardPrompt() {
        return "这是一张服装物料色卡/面料标签的图片。请识别图片中包含的物料信息，包括所有可见的文字内容。\n\n"
                + "任务：从中提取以下字段，严格返回仅包含字段名的 JSON 格式（JSON顶层为对象，不要包含 markdown 代码块标记）：\n\n"
                + "- materialName: 物料名称 / 面料名称\n"
                + "- materialType: 物料类型（面料/里料/辅料；或英文 fabric/lining/accessory）\n"
                + "- color: 颜色名称\n"
                + "- fabricWidth: 幅宽（如 150cm）\n"
                + "- fabricWeight: 克重（如 200g/m²）\n"
                + "- fabricComposition: 成分（如 80%棉 20%涤纶）\n"
                + "- specifications: 规格信息\n"
                + "- unit: 计量单位（如 米/公斤/码/个）\n"
                + "- supplierName: 供应商/厂商名称\n"
                + "- unitPrice: 单价（数字，单位元）\n"
                + "- styleNo: 款号 / 款式编号\n"
                + "- description: 备注信息\n\n"
                + "对每个字段，尽量从图片中提取：文本内容、置信度（0-100）和原文。\n\n"
                + "期望的 JSON 格式：\n"
                + "{\n"
                + "  \"materialName\": { \"text\": \"精梳棉\", \"confidence\": 95, \"raw\": \"精梳棉\" },\n"
                + "  \"materialType\": { \"text\": \"fabric\", \"confidence\": 90, \"raw\": \"面料\" },\n"
                + "  \"color\": { \"text\": \"藏青色\", \"confidence\": 88, \"raw\": \"藏青\" },\n"
                + "  \"fabricWidth\": { \"text\": \"150cm\", \"confidence\": 85, \"raw\": \"幅宽 150cm\" },\n"
                + "  \"fabricWeight\": { \"text\": \"200g/m²\", \"confidence\": 85, \"raw\": \"200g\" },\n"
                + "  \"fabricComposition\": { \"text\": \"100%棉\", \"confidence\": 92, \"raw\": \"100%棉\" },\n"
                + "  \"specifications\": { \"text\": \"...\", \"confidence\": 70, \"raw\": \"...\" },\n"
                + "  \"unit\": { \"text\": \"米\", \"confidence\": 80, \"raw\": \"单位：米\" },\n"
                + "  \"supplierName\": { \"text\": \"...\", \"confidence\": 65, \"raw\": \"...\" },\n"
                + "  \"unitPrice\": { \"text\": \"35.00\", \"confidence\": 75, \"raw\": \"单价 35 元\" },\n"
                + "  \"styleNo\": { \"text\": \"...\", \"confidence\": 50, \"raw\": \"...\" },\n"
                + "  \"description\": { \"text\": \"...\", \"confidence\": 60, \"raw\": \"...\" }\n"
                + "}\n\n"
                + "如果某个字段在图片中找不到对应信息，请设为 null。确保返回合法的 JSON。";
    }

    /**
     * 从视觉模型返回的 report 中提取 JSON 对象
     * 支持：纯 JSON、JSON 被文本包裹、JSON 在 markdown 代码块中等多种情况
     */
    private JsonNode tryExtractJsonFromReport(String report) {
        if (report == null || report.isBlank()) return null;
        String trimmed = report.trim();

        // 1) 如果直接是 JSON
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try { return MAPPER.readTree(trimmed); } catch (Exception ignored) {}
        }

        // 2) 去除可能的 markdown ```json ... ``` 代码块标记
        String cleaned = trimmed
                .replaceAll("(?s)^```\\s*(?:json|JSON)?\\s*", "")
                .replaceAll("(?s)```\\s*$", "");

        // 3) 查找第一个 { 和最后一个 }
        int firstBrace = cleaned.indexOf('{');
        int lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            String potentialJson = cleaned.substring(firstBrace, lastBrace + 1);
            try { return MAPPER.readTree(potentialJson); } catch (Exception ignored) {}
        }

        // 4) 逐行找 JSON
        for (String line : cleaned.split("\n")) {
            String l = line.trim();
            if (l.startsWith("{") && l.endsWith("}")) {
                try { return MAPPER.readTree(l); } catch (Exception ignored) {}
            }
        }
        return null;
    }

    private MaterialColorCardRecognitionResult.FieldValue extractField(
            JsonNode root, String fieldName, @SuppressWarnings("unused") String displayName) {
        JsonNode node = root.get(fieldName);
        if (node == null || node.isNull()) return null;

        String textValue = null;
        Integer confidence = null;
        String rawText = null;

        if (node.isObject()) {
            if (node.has("text") && !node.get("text").isNull()) {
                textValue = node.get("text").asText();
            }
            if (node.has("confidence") && !node.get("confidence").isNull()) {
                try { confidence = node.get("confidence").asInt(); } catch (Exception ignored) {}
            }
            if (node.has("raw") && !node.get("raw").isNull()) {
                rawText = node.get("raw").asText();
            }
        } else if (node.isTextual()) {
            textValue = node.asText();
            confidence = 60; // 如果 AI 只是写了字符串，给默认中等置信度
            rawText = textValue;
        }

        if (textValue == null || textValue.isBlank()) return null;
        return MaterialColorCardRecognitionResult.FieldValue.ofText(
                textValue.trim(),
                confidence != null ? confidence : 60,
                rawText);
    }

    private MaterialColorCardRecognitionResult.FieldValue extractNumberField(
            JsonNode root, String fieldName, String displayName) {
        MaterialColorCardRecognitionResult.FieldValue textField = extractField(root, fieldName, displayName);
        if (textField == null) return null;
        String text = textField.getTextValue();
        if (text == null || text.isBlank()) return textField;

        // 尝试从文本中提取纯数字（如 "35.00"、"35元"、"35元/米"）
        try {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("([0-9]+(?:\\.[0-9]+)?)").matcher(text);
            if (m.find()) {
                BigDecimal num = new BigDecimal(m.group(1));
                MaterialColorCardRecognitionResult.FieldValue result =
                        MaterialColorCardRecognitionResult.FieldValue.ofNumber(num,
                                textField.getConfidence(), textField.getRawText());
                result.setTextValue(num.toPlainString());
                return result;
            }
        } catch (Exception ignored) {}
        return textField;
    }

    private String normalizeMaterialType(String input) {
        if (input == null) return null;
        String lower = input.trim().toLowerCase();

        List<String> fabricKeywords = new ArrayList<>();
        fabricKeywords.add("fabric"); fabricKeywords.add("面料"); fabricKeywords.add("主料");
        fabricKeywords.add("外层"); fabricKeywords.add("表料");

        List<String> liningKeywords = new ArrayList<>();
        liningKeywords.add("lining"); liningKeywords.add("里料"); liningKeywords.add("里布");
        liningKeywords.add("内衬"); liningKeywords.add("内层");

        if (fabricKeywords.stream().anyMatch(lower::contains)) return "fabric";
        if (liningKeywords.stream().anyMatch(lower::contains)) return "lining";
        return "accessory"; // 默认归为辅料
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() <= maxLen ? s : s.substring(0, maxLen);
    }
}
