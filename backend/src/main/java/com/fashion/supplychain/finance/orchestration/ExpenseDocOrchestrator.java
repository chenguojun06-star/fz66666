package com.fashion.supplychain.finance.orchestration;

import com.fashion.supplychain.common.CosService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.ExpenseReimbursementDoc;
import com.fashion.supplychain.finance.service.ExpenseReimbursementDocService;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 报销单凭证上传 + AI识别编排器
 * <p>
 * 流程：上传图片到COS → AI视觉识别凭证信息 → 保存识别结果到 t_expense_reimbursement_doc
 * </p>
 */
@Slf4j
@Service
public class ExpenseDocOrchestrator {

    @Autowired
    private CosService cosService;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Autowired
    private ExpenseReimbursementDocService docService;

    // ─────────────────────────────────────────────────────────────────
    // 主入口：上传 + AI识别
    // ─────────────────────────────────────────────────────────────────

    /**
     * 上传报销凭证图片并调用AI识别
     *
     * @param file       图片文件
     * @return 识别结果 Map：docId, imageUrl, rawText, recognizedAmount, recognizedDate, recognizedTitle, recognizedType
     */
    public Map<String, Object> recognizeDoc(MultipartFile file) {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        String username = UserContext.username();

        // 1. 上传图片到 COS
        String imageUrl = uploadFileToCos(tenantId, file);
        if (imageUrl == null) {
            Map<String, Object> err = new HashMap<>();
            err.put("error", "图片上传失败，请重试");
            return err;
        }

        // 2. AI视觉识别：从图片提取金额/日期/事由等
        String aiRaw = null;
        try {
            if (inferenceOrchestrator.isVisionEnabled()) {
                aiRaw = inferenceOrchestrator.chatWithVision(imageUrl, buildVisionPrompt());
            }
            if (aiRaw == null || aiRaw.isBlank()) {
                IntelligenceInferenceResult res = inferenceOrchestrator.chat(
                        "expense-doc-recognize",
                        buildSystemPrompt(),
                        buildUserMessage(imageUrl)
                );
                if (res != null && res.isSuccess()) {
                    aiRaw = res.getContent();
                }
            }
            if (aiRaw == null) {
                log.warn("[ExpenseDocRecognize] AI识别失败或无响应, imageUrl={}", imageUrl);
            }
        } catch (Exception e) {
            log.warn("[ExpenseDocRecognize] AI调用异常: {}", e.getMessage());
        }

        // 3. 解析AI结果
        Map<String, Object> parsed = parseAiResult(aiRaw);

        // 4. 保存凭证记录到DB
        ExpenseReimbursementDoc doc = new ExpenseReimbursementDoc();
        doc.setTenantId(tenantId);
        doc.setImageUrl(imageUrl);
        doc.setRawText(aiRaw);
        doc.setUploaderId(userId);
        doc.setUploaderName(username);

        Object amountObj = parsed.get("amount");
        if (amountObj != null) {
            try {
                String amountStr = amountObj.toString().replaceAll("[^0-9.]", "");
                if (!amountStr.isEmpty()) doc.setRecognizedAmount(new BigDecimal(amountStr));
            } catch (NumberFormatException e) {
                log.warn("[ExpenseDoc] 金额解析失败，amountStr={}: {}", amountObj, e.getMessage());
            }
        }
        doc.setRecognizedDate((String) parsed.get("date"));
        doc.setRecognizedTitle((String) parsed.get("title"));
        doc.setRecognizedType((String) parsed.get("expenseType"));

        docService.save(doc);
        log.info("[ExpenseDocRecognize] 凭证已保存 docId={}, tenantId={}", doc.getId(), tenantId);

        // 5. 返回给前端（含新增字段：supplierName, invoiceNo, taxRate, taxAmount, items）
        Map<String, Object> result = new HashMap<>();
        result.put("docId", doc.getId());
        result.put("imageUrl", imageUrl);
        result.put("rawText", aiRaw);
        result.put("recognizedAmount", doc.getRecognizedAmount());
        result.put("recognizedDate", doc.getRecognizedDate());
        result.put("recognizedTitle", doc.getRecognizedTitle());
        result.put("recognizedType", doc.getRecognizedType());
        result.put("recognizedSupplierName", parsed.get("supplier"));
        result.put("recognizedInvoiceNo", parsed.get("invoiceNo"));
        result.put("recognizedTaxRate", parsed.get("taxRate"));
        result.put("recognizedTaxAmount", parsed.get("taxAmount"));
        result.put("recognizedItems", parsed.get("items"));
        return result;
    }

    // ─────────────────────────────────────────────────────────────────
    // 文件上传
    // ─────────────────────────────────────────────────────────────────

    private String uploadFileToCos(Long tenantId, MultipartFile file) {
        try {
            String original = file.getOriginalFilename() != null
                    ? file.getOriginalFilename() : "receipt";
            String ext = original.contains(".")
                    ? original.substring(original.lastIndexOf('.')) : ".jpg";
            String filename = "expense-docs/" + UUID.randomUUID() + ext;
            cosService.upload(tenantId, filename, file);
            // 预签名URL，有效期60分钟供AI分析
            return cosService.getPresignedUrl(tenantId, filename);
        } catch (Exception e) {
            log.error("[ExpenseDocRecognize] COS上传失败", e);
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // AI Prompt 构建
    // ─────────────────────────────────────────────────────────────────

    private String buildSystemPrompt() {
        return "你是企业费用报销凭证识别AI。" +
               "当用户提供图片URL时，请识别图片中的发票/收据/报销凭证内容，提取关键报销信息。\n" +
               "必须以纯JSON格式返回（不要有任何其他说明文字），格式如下：\n" +
               "{\n" +
               "  \"amount\": 金额数字（含税金额，仅数字，如123.50，识别不到填null）,\n" +
               "  \"date\": \"费用发生日期或开票日期，格式YYYY-MM-DD，识别不到填null\",\n" +
               "  \"title\": \"费用简要描述，如：餐饮费、出租车费、机票、酒店住宿等，识别不到填null\",\n" +
               "  \"expenseType\": \"推断费用类型：taxi（打车）/ travel（差旅交通）/" +
               "accommodation（住宿）/ office（办公用品）/ entertainment（招待）/ material_advance（材料垫付）/" +
               "other（其他），无法判断填null\",\n" +
               "  \"supplier\": \"商户/开票单位名称，识别不到填null\",\n" +
               "  \"invoiceNo\": \"发票号码/单据编号，识别不到填null\",\n" +
               "  \"taxRate\": \"税率，如13%、6%、3%等，识别不到填null\",\n" +
               "  \"taxAmount\": 税额数字（仅数字，如15.60，识别不到填null）,\n" +
               "  \"items\": [\"物品或服务明细项目名称，可填多个，识别不到填空数组\"]\n" +
               "}\n" +
               "只返回JSON，不要有其他说明文字。如果图片无法识别，返回所有字段均为null或空数组的JSON。";
    }

    private String buildUserMessage(String imageUrl) {
        return "请识别以下报销凭证图片，图片URL: " + imageUrl + "，按要求格式返回JSON。";
    }

    private String buildVisionPrompt() {
        return buildSystemPrompt() + "\n\n请直接分析图片内容，按要求格式返回JSON。";
    }

    // ─────────────────────────────────────────────────────────────────
    // AI 结果解析
    // ─────────────────────────────────────────────────────────────────

    private Map<String, Object> parseAiResult(String raw) {
        Map<String, Object> result = new HashMap<>();
        if (raw == null || raw.isBlank()) return result;

        try {
            String json = extractJson(raw);
            result.put("amount", extractField(json, "amount"));
            result.put("date", extractStrField(json, "date"));
            result.put("title", extractStrField(json, "title"));
            result.put("expenseType", extractStrField(json, "expenseType"));
            result.put("supplier", extractStrField(json, "supplier"));
            result.put("invoiceNo", extractStrField(json, "invoiceNo"));
            result.put("taxRate", extractStrField(json, "taxRate"));
            result.put("taxAmount", extractField(json, "taxAmount"));
            result.put("items", extractListField(json, "items"));
        } catch (Exception e) {
            log.warn("[ExpenseDocRecognize] 解析AI结果失败: {}", e.getMessage());
        }

        return result;
    }

    private String extractJson(String raw) {
        Pattern md = Pattern.compile("```(?:json)?\\s*([\\s\\S]*?)\\s*```");
        Matcher mdm = md.matcher(raw);
        if (mdm.find()) return mdm.group(1).trim();
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) return raw.substring(start, end + 1);
        return raw;
    }

    /** 提取字符串字段（去除引号和null） */
    private String extractStrField(String json, String key) {
        Pattern p = Pattern.compile("\"" + key + "\"\\s*:\\s*\"([^\"]*?)\"");
        Matcher m = p.matcher(json);
        if (m.find()) {
            String val = m.group(1).trim();
            return (val.equalsIgnoreCase("null") || val.isEmpty()) ? null : val;
        }
        return null;
    }

    /** 提取数值字段（支持直接数字或带引号） */
    private String extractField(String json, String key) {
        Pattern p = Pattern.compile("\"" + key + "\"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)");
        Matcher m = p.matcher(json);
        if (m.find()) return m.group(1);
        return extractStrField(json, key);
    }

    /** 提取数组字段（简单数组，如 ["a","b"]） */
    private java.util.List<String> extractListField(String json, String key) {
        java.util.List<String> result = new java.util.ArrayList<>();
        Pattern p = Pattern.compile("\"" + key + "\"\\s*:\\s*\\[([^\\]]*)\\]");
        Matcher m = p.matcher(json);
        if (m.find()) {
            String content = m.group(1).trim();
            if (!content.isEmpty()) {
                Pattern itemP = Pattern.compile("\"([^\"]+?)\"");
                Matcher itemM = itemP.matcher(content);
                while (itemM.find()) {
                    result.add(itemM.group(1).trim());
                }
            }
        }
        return result;
    }
}
