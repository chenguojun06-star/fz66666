package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.common.CosService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 工艺单图片AI识别编排器
 * 上传图片到COS → 调用Agnes视觉模型识别文字 → 返回生产要求文本
 */
@Service
@Slf4j
public class StyleDocOcrOrchestrator {

    @Autowired
    private CosService cosService;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    /**
     * 识别工艺单图片，提取生产要求文本
     */
    public Map<String, Object> recognizeRequirementDoc(MultipartFile file) {
        Long tenantId = UserContext.tenantId();

        if (!inferenceOrchestrator.isVisionEnabled()) {
            throw new IllegalStateException("AI视觉识别未启用，请联系管理员配置Agnes视觉模型");
        }

        String imageUrl = uploadFileToCos(tenantId, file);
        if (imageUrl == null) {
            throw new IllegalStateException("图片上传失败，请检查网络连接后重试");
        }

        try {
            String prompt = "你是专业服装生产管理助手。请仔细识别图片中工艺单的全部文字内容。\n" +
                    "重点提取（如图片中有）：\n" +
                    "1. 裁剪要求（面料方向、排版、缩水处理、裁片要求等）\n" +
                    "2. 车缝工艺要求（缝份宽度、线迹类型、线色、特殊处理等）\n" +
                    "3. 后整理工艺（锁眼、钉扣、整烫、绣花、印花等）\n" +
                    "4. 质量标准和检验要求\n" +
                    "5. 其他生产指示和注意事项\n" +
                    "请将识别内容按原始格式输出，每项要求单独一行。\n" +
                    "直接输出纯文本，不要输出JSON，不要添加额外解释。";

            String rawText = inferenceOrchestrator.chatWithVision(imageUrl, prompt);
            if (rawText == null) rawText = "";
            log.info("[StyleDocOcr] 工艺单识别完成 tenantId={} 字符数={}", tenantId, rawText.length());

            Map<String, Object> result = new HashMap<>();
            result.put("rawText", rawText);
            result.put("imageUrl", imageUrl);
            return result;
        } catch (Exception e) {
            log.warn("[StyleDocOcr] AI识别异常 tenantId={}: {}", tenantId, e.getMessage());
            throw new IllegalStateException("AI识别失败，请重试：" + e.getMessage());
        }
    }

    /**
     * 识别尺寸表图片，提取尺码和部位尺寸数据
     * 返回结构化JSON：{ sizes: ["S","M","L"], parts: [{ name: "衣长", values: { "S": 65, "M": 67, "L": 69 } }] }
     */
    public Map<String, Object> recognizeSizeTable(MultipartFile file) {
        Long tenantId = UserContext.tenantId();

        if (!inferenceOrchestrator.isVisionEnabled()) {
            throw new IllegalStateException("AI视觉识别未启用，请联系管理员配置Agnes视觉模型");
        }

        String imageUrl = uploadFileToCos(tenantId, file);
        if (imageUrl == null) {
            throw new IllegalStateException("图片上传失败，请检查网络连接后重试");
        }

        try {
            String prompt = "你是专业服装尺寸表识别助手。请仔细识别图片中的尺寸表。\n" +
                    "重点提取以下信息：\n" +
                    "1. 尺码名称（如：S、M、L、XL，或 155/80A、160/84A 等）\n" +
                    "2. 部位名称（如：衣长、胸围、肩宽、袖长等）\n" +
                    "3. 每个部位在各尺码下的具体数值（单位：cm厘米）\n" +
                    "4. 测量方法（如：平铺量、拉伸量等）\n" +
                    "5. 公差范围（如：±1cm等）\n\n" +
                    "请严格按照以下JSON格式输出，不要输出其他内容。必须保证是合法的 JSON，且 values 中的 key 与 sizes 数组中的尺码名称完全一致：\n" +
                    "{\n" +
                    "  \"sizes\": [\"尺码1\", \"尺码2\", \"尺码3\"],\n" +
                    "  \"parts\": [\n" +
                    "    {\n" +
                    "      \"name\": \"部位名称\",\n" +
                    "      \"measureMethod\": \"测量方法（如平铺量）\",\n" +
                    "      \"tolerance\": \"±1cm\",\n" +
                    "      \"values\": { \"尺码1\": 数值, \"尺码2\": 数值, \"尺码3\": 数值 }\n" +
                    "    }\n" +
                    "  ]\n" +
                    "}\n\n" +
                    "注意：\n" +
                    "- values里的key必须与sizes数组中的尺码名称完全一致\n" +
                    "- 只输出JSON，不要有任何解释性文字、代码块标记或Markdown格式\n" +
                    "- 如果某些部位没有数值，values里对应尺码请填null\n" +
                    "- 数值必须是数字，不要包含 cm/厘米 等单位\n" +
                    "- 如果图片中有多行表头，只取第一个尺码行\n" +
                    "- 输出 JSON 后不要有任何尾随字符";

            String rawJson = inferenceOrchestrator.chatWithVision(imageUrl, prompt);
            if (rawJson == null || rawJson.trim().isEmpty()) {
                throw new IllegalStateException("AI识别返回为空，请重试");
            }

            log.info("[SizeTableOcr] 尺寸表识别完成 tenantId={} 字符数={}", tenantId, rawJson.length());

            // ====== 鲁棒 JSON 解析：多重兜底，保证识别结果可被前端使用 ======
            Map<String, Object> result = parseSizeTableResult(rawJson);

            result.put("imageUrl", imageUrl);
            return result;
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[SizeTableOcr] AI识别异常 tenantId={}: {}", tenantId, e.getMessage());
            throw new IllegalStateException("AI识别失败，请重试：" + e.getMessage());
        }
    }

    /** 多重兜底解析尺寸表识别结果。*/
    @SuppressWarnings("unchecked")
    private Map<String, Object> parseSizeTableResult(String rawJson) {
        Map<String, Object> fallback = new java.util.LinkedHashMap<>();
        fallback.put("rawJson", rawJson);
        fallback.put("sizes", new java.util.ArrayList<>());
        fallback.put("parts", new java.util.ArrayList<>());

        if (rawJson == null || rawJson.trim().isEmpty()) {
            log.warn("[SizeTableOcr] AI返回为空文本");
            return fallback;
        }

        // 清洗常见 Markdown / 前后缀
        String text = rawJson.trim();
        if (text.startsWith("```json")) text = text.substring(7);
        if (text.startsWith("```")) text = text.substring(3);
        if (text.endsWith("```")) text = text.substring(0, text.length() - 3);
        text = text.trim();

        // 尝试1: 直接解析
        java.util.Map<String, Object> parsed = tryParseJsonObject(text);
        if (parsed != null && isValidSizeTablePayload(parsed)) {
            fallback.putAll(parsed);
            fallback.put("rawJson", rawJson);
            log.info("[SizeTableOcr] 直接解析成功 sizes={}, parts={}",
                    java.util.Objects.toString(parsed.get("sizes")),
                    ((java.util.List<?>) parsed.getOrDefault("parts", new java.util.ArrayList<>())).size());
            return fallback;
        }

        // 尝试2: 从第一个 { 到最后一个 } 切片
        int firstBrace = text.indexOf('{');
        int lastBrace = text.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            String sliced = text.substring(firstBrace, lastBrace + 1);
            java.util.Map<String, Object> parsed2 = tryParseJsonObject(sliced);
            if (parsed2 != null && isValidSizeTablePayload(parsed2)) {
                fallback.putAll(parsed2);
                fallback.put("rawJson", rawJson);
                log.info("[SizeTableOcr] 切片解析成功 sizes={}", parsed2.get("sizes"));
                return fallback;
            }
        }

        // 尝试3: 只保留 JSON 友好字符（压缩空白）
        String stripped = text.replaceAll("(?s)\\s+", " ");
        java.util.Map<String, Object> parsed3 = tryParseJsonObject(stripped);
        if (parsed3 != null && isValidSizeTablePayload(parsed3)) {
            fallback.putAll(parsed3);
            fallback.put("rawJson", rawJson);
            log.info("[SizeTableOcr] 压缩后解析成功 sizes={}", parsed3.get("sizes"));
            return fallback;
        }

        log.warn("[SizeTableOcr] JSON解析失败，返回空结构供用户手动录入 rawPreview={}",
                text.length() > 160 ? text.substring(0, 160) + "..." : text);
        return fallback;
    }

    /** 校验解析结果是否是有效的尺寸表 payload（至少含 sizes 或 parts 之一）。*/
    private boolean isValidSizeTablePayload(java.util.Map<String, Object> obj) {
        if (obj == null) return false;
        Object sizes = obj.get("sizes");
        Object parts = obj.get("parts");
        boolean hasSizes = sizes instanceof java.util.List && !((java.util.List<?>) sizes).isEmpty();
        boolean hasParts = parts instanceof java.util.List && !((java.util.List<?>) parts).isEmpty();
        return hasSizes || hasParts;
    }

    @SuppressWarnings("unchecked")
    private java.util.Map<String, Object> tryParseJsonObject(String candidate) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            java.util.Map<String, Object> obj = mapper.readValue(candidate,
                    new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {});
            if (obj == null) return null;
            if (!obj.containsKey("sizes") && !obj.containsKey("parts")) {
                // 可能被包了一层 data/result
                for (String key : obj.keySet()) {
                    Object inner = obj.get(key);
                    if (inner instanceof java.util.Map) {
                        java.util.Map<String, Object> innerMap = (java.util.Map<String, Object>) inner;
                        if (innerMap.containsKey("sizes") || innerMap.containsKey("parts")) {
                            return innerMap;
                        }
                    }
                }
            }
            return obj;
        } catch (Exception e) {
            return null;
        }
    }

    private String uploadFileToCos(Long tenantId, MultipartFile file) {
        try {
            // 本地开发模式（COS未配置）：直接转base64 data URI，让Agnes Vision直接读取
            if (!cosService.isEnabled()) {
                byte[] bytes = file.getBytes();
                if (bytes.length > 8 * 1024 * 1024) {
                    log.warn("[StyleDocOcr] 图片超过8MB，本地模式不支持大图片（COS未配置）");
                    return null;
                }
                String mimeType = file.getContentType() != null ? file.getContentType() : "image/jpeg";
                String base64 = java.util.Base64.getEncoder().encodeToString(bytes);
                log.info("[StyleDocOcr] COS未配置，使用base64模式 mimeType={} size={}KB", mimeType, bytes.length / 1024);
                return "data:" + mimeType + ";base64," + base64;
            }
            // 生产模式：上传到COS并返回预签名HTTP URL
            String original = file.getOriginalFilename() != null ? file.getOriginalFilename() : "workorder";
            String ext = original.contains(".") ? original.substring(original.lastIndexOf('.')) : ".jpg";
            String filename = "style-workorder-ocr/" + UUID.randomUUID() + ext;
            cosService.upload(tenantId, filename, file);
            return cosService.getPresignedUrl(tenantId, filename);
        } catch (Exception e) {
            log.error("[StyleDocOcr] 图片处理失败 tenantId={}", tenantId, e);
            return null;
        }
    }
}
