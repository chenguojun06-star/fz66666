package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.common.CosService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 工艺单图片AI识别编排器
 * 上传图片到COS → 调用豆包视觉模型识别文字 → 返回生产要求文本
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
            throw new IllegalStateException("AI视觉识别未启用，请联系管理员配置豆包视觉模型");
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

            String rawText = inferenceOrchestrator.chatWithDoubaoVision(imageUrl, prompt);
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

    private String uploadFileToCos(Long tenantId, MultipartFile file) {
        try {
            // 本地开发模式（COS未配置）：直接转base64 data URI，让豆包Vision直接读取
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
