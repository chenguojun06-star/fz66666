package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.CosService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PurchaseOrderDoc;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.PurchaseOrderDocService;
import com.fashion.supplychain.procurement.orchestration.ProcurementOrchestrator;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 采购单文档 AI 识别编排器
 *
 * 功能：上传供应商发货单/采购单图片 → AI 识别文字内容 →
 *       与当前订单采购明细匹配 → 返回结构化识别结果供前端自动填写
 *
 * 典型流程：
 *   1. 上传图片至腾讯云 COS，获取访问 URL
 *   2. 调用 IntelligenceInferenceOrchestrator 传入图片 URL 做 OCR 识别
 *   3. 解析 AI 返回的 JSON（物料编码、名称、数量、供应商）
 *   4. 按 orderNo 拉取当前未完成的采购条目，做模糊匹配
 *   5. 返回 matchedItems（matched/unmatched）+ rawText
 */
@Slf4j
@Service
public class MaterialPurchaseDocOrchestrator {

    @Autowired
    private CosService cosService;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private PurchaseOrderDocService purchaseOrderDocService;

    @Autowired
    private ProcurementOrchestrator procurementOrchestrator;

    // ─────────────────────────────────────────────────────────────────
    // 公共入口
    // ─────────────────────────────────────────────────────────────────

    /**
     * 上传采购单文档并 AI 识别
     *
     * @param file    用户上传的图片或 PDF（支持 jpg/png/webp/pdf）
     * @param orderNo 订单编号（用于匹配采购条目，可空）
     * @return 识别结果 Map，包含 items、rawText、imageUrl、matchCount
     */
    public Map<String, Object> recognizeDoc(MultipartFile file, String orderNo) {
        Long tenantId = UserContext.tenantId();

        // 1. 上传文件到 COS
        String imageUrl = uploadFileToCos(tenantId, file);
        if (imageUrl == null) {
            Map<String, Object> err = new HashMap<>();
            err.put("error", "文件上传失败，请检查网络和文件格式");
            err.put("items", new ArrayList<>());
            return err;
        }

        // 2. 调用 AI 视觉识别（优先 Doubao Vision 真正看图，降级时用文本模式）
        String aiRaw;
        try {
            if (inferenceOrchestrator.isVisionEnabled()) {
                // 视觉模式：imageUrl 作为图像内容传入，AI 真正读取图片中的文字
                String visionPrompt = buildSystemPrompt()
                        + (orderNo != null && !orderNo.isBlank()
                                ? "\n（对应订单号：" + orderNo + "）"
                                : "")
                        + "\n请识别图片中的采购单内容，按格式返回JSON。";
                String visionResult = inferenceOrchestrator.chatWithDoubaoVision(imageUrl, visionPrompt);
                aiRaw = visionResult != null ? visionResult : "";
                log.info("[PurchaseDocRecognize] Vision识别完成, 结果长度={}", aiRaw.length());
            } else {
                // 降级：文本模式（LLM 无法真正看图，识别效果有限）
                log.warn("[PurchaseDocRecognize] Doubao Vision 未配置，降级文本模式（建议配置 DOUBAO_API_KEY 和视觉模型）");
                var inferResult = inferenceOrchestrator.chat(
                        "purchase-doc-recognize", buildSystemPrompt(), buildUserMessage(imageUrl, orderNo));
                aiRaw = inferResult.isSuccess() ? inferResult.getContent() : "";
            }
        } catch (Exception e) {
            log.warn("[PurchaseDocRecognize] AI call exception: {}", e.getMessage());
            aiRaw = "";
        }

        // 3. 解析 AI 返回的物料清单
        List<Map<String, Object>> recognizedItems = parseAiItems(aiRaw);

        // 4. 与订单采购明细做匹配（有 orderNo 时）
        List<Map<String, Object>> matchedItems = matchWithPurchaseItems(
                recognizedItems, orderNo, tenantId);

        long matchCount = matchedItems.stream()
                .filter(m -> Boolean.TRUE.equals(m.get("matched"))).count();
        Map<String, Object> result = new HashMap<>();

        // 5. 持久化到 t_purchase_order_doc（单据永久保存在详情页）
        try {
            PurchaseOrderDoc doc = new PurchaseOrderDoc();
            doc.setTenantId(tenantId);
            doc.setOrderNo(orderNo != null ? orderNo : "");
            doc.setImageUrl(imageUrl);
            doc.setRawText(aiRaw != null && aiRaw.length() > 2000
                    ? aiRaw.substring(0, 2000) : aiRaw);
            doc.setMatchCount((int) matchCount);
            doc.setTotalRecognized(recognizedItems.size());
            doc.setUploaderId(UserContext.userId());
            doc.setUploaderName(UserContext.username());
            doc.setDeleteFlag(0);
            purchaseOrderDocService.save(doc);
            log.info("[PurchaseDocRecognize] 单据已保存 id={} orderNo={} matchCount={}",
                    doc.getId(), orderNo, matchCount);
            result.put("docId", doc.getId());
        } catch (Exception e) {
            log.warn("[PurchaseDocRecognize] 单据保存DB失败（不影响识别结果返回）: {}", e.getMessage());
        }
        result.put("imageUrl", imageUrl);
        result.put("rawText", aiRaw);
        result.put("items", matchedItems);
        result.put("matchCount", matchCount);
        result.put("totalRecognized", recognizedItems.size());
        return result;
    }

    public Map<String, Object> replaySavedDoc(String docId, String orderNo) {
        PurchaseOrderDoc doc = resolveDoc(docId, orderNo);
        String resolvedOrderNo = orderNo != null && !orderNo.isBlank() ? orderNo.trim() : doc.getOrderNo();
        List<Map<String, Object>> recognizedItems = parseAiItems(doc.getRawText());
        List<Map<String, Object>> matchedItems = matchWithPurchaseItems(recognizedItems, resolvedOrderNo, UserContext.tenantId());
        long matchCount = matchedItems.stream().filter(m -> Boolean.TRUE.equals(m.get("matched"))).count();
        Map<String, Object> result = new HashMap<>();
        result.put("docId", doc.getId());
        result.put("imageUrl", doc.getImageUrl());
        result.put("orderNo", resolvedOrderNo);
        result.put("items", matchedItems);
        result.put("matchCount", matchCount);
        result.put("totalRecognized", recognizedItems.size());
        return result;
    }

    public Map<String, Object> autoExecuteSavedDoc(String docId, String orderNo, String warehouseLocation, boolean confirmInbound) {
        Map<String, Object> replay = replaySavedDoc(docId, orderNo);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) replay.getOrDefault("items", List.of());
        List<Map<String, Object>> executed = new ArrayList<>();
        List<Map<String, Object>> skipped = new ArrayList<>();
        for (Map<String, Object> item : items) {
            if (!Boolean.TRUE.equals(item.get("matched")) || item.get("purchaseId") == null) {
                skipped.add(copyExecutionItem(item, "skipped", "未匹配到采购单"));
                continue;
            }
            Integer qty = toInteger(item.get("quantity"));
            if (qty == null || qty <= 0) {
                skipped.add(copyExecutionItem(item, "skipped", "识别数量为空或无效"));
                continue;
            }
            try {
                Map<String, Object> params = new LinkedHashMap<>();
                params.put("purchaseId", String.valueOf(item.get("purchaseId")));
                params.put("arrivedQuantity", qty);
                params.put("warehouseLocation", warehouseLocation);
                params.put("operatorId", UserContext.userId());
                params.put("operatorName", UserContext.username());
                params.put("remark", "小云根据采购单据识别自动执行");
                Object result = confirmInbound
                        ? procurementOrchestrator.confirmArrivalAndInbound(params)
                        : procurementOrchestrator.updateArrivedQuantity(Map.of(
                                "id", String.valueOf(item.get("purchaseId")),
                                "arrivedQuantity", qty,
                                "remark", "小云根据采购单据识别自动登记到货"));
                Map<String, Object> row = copyExecutionItem(item, "success", confirmInbound ? "已到货并入库" : "已登记到货");
                row.put("result", result);
                executed.add(row);
            } catch (Exception e) {
                skipped.add(copyExecutionItem(item, "failed", e.getMessage()));
            }
        }
        Map<String, Object> result = new LinkedHashMap<>(replay);
        result.put("executed", executed);
        result.put("skipped", skipped);
        result.put("confirmInbound", confirmInbound);
        result.put("warehouseLocation", warehouseLocation);
        result.put("summary", "已执行 " + executed.size() + " 条，跳过 " + skipped.size() + " 条");
        return result;
    }

    // ─────────────────────────────────────────────────────────────────
    // 文件上传
    // ─────────────────────────────────────────────────────────────────

    private String uploadFileToCos(Long tenantId, MultipartFile file) {
        try {
            String original = file.getOriginalFilename() != null
                    ? file.getOriginalFilename() : "doc";
            String ext = original.contains(".")
                    ? original.substring(original.lastIndexOf('.')) : ".jpg";
            String filename = "purchase-docs/" + UUID.randomUUID() + ext;
            cosService.upload(tenantId, filename, file);
            // 有效期 60 分钟，足够 AI 分析使用
            return cosService.getPresignedUrl(tenantId, filename);
        } catch (Exception e) {
            log.error("[PurchaseDocRecognize] COS upload failed", e);
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // AI Prompt 构建
    // ─────────────────────────────────────────────────────────────────

    private String buildSystemPrompt() {
        return "你是服装供应链采购单识别AI。" +
               "当用户提供图片URL时，请识别图片中的采购单/发货单/送货清单内容，" +
               "提取每行物料的：物料编码、物料名称、规格/颜色/尺码、数量、单位、单价、供应商。\n" +
               "如果某字段识别不到，填null。\n" +
               "必须以纯JSON格式返回，格式如下：\n" +
               "{\n" +
               "  \"supplier\": \"供应商名称（整单统一供应商，识别不到填null）\",\n" +
               "  \"docNo\": \"单据号或发货单号（识别不到填null）\",\n" +
               "  \"items\": [\n" +
               "    {\n" +
               "      \"materialCode\": \"物料编码\",\n" +
               "      \"materialName\": \"物料名称\",\n" +
               "      \"specifications\": \"规格描述（颜色/克重/门幅等）\",\n" +
               "      \"quantity\": 数字,\n" +
               "      \"unit\": \"单位（米/kg/码等）\",\n" +
               "      \"unitPrice\": 数字或null,\n" +
               "      \"color\": \"颜色\",\n" +
               "      \"remark\": \"备注\"\n" +
               "    }\n" +
               "  ]\n" +
               "}\n" +
               "只返回JSON，不要有其他说明文字。";
    }

    private String buildUserMessage(String imageUrl, String orderNo) {
        StringBuilder sb = new StringBuilder();
        sb.append("请识别以下采购单图片中的物料信息，图片URL: ").append(imageUrl);
        if (orderNo != null && !orderNo.isBlank()) {
            sb.append("（该采购单对应订单号：").append(orderNo).append("）");
        }
        sb.append("，按要求格式返回JSON。");
        return sb.toString();
    }

    // ─────────────────────────────────────────────────────────────────
    // AI 结果解析
    // ─────────────────────────────────────────────────────────────────

    private List<Map<String, Object>> parseAiItems(String raw) {
        List<Map<String, Object>> items = new ArrayList<>();
        if (raw == null || raw.isBlank()) return items;

        try {
            // 提取 JSON 块（LLM 可能包含 markdown 代码块）
            String json = extractJson(raw);

            // 提取 items 数组内容
            Pattern itemsPattern = Pattern.compile("\"items\"\\s*:\\s*\\[([\\s\\S]*?)\\]");
            Matcher itemsMatcher = itemsPattern.matcher(json);
            if (!itemsMatcher.find()) {
                log.info("[PurchaseDocRecognize] No items array found in AI response");
                return items;
            }

            String itemsContent = itemsMatcher.group(1);
            // 逐个解析每个 {} 对象
            Pattern objPattern = Pattern.compile("\\{([^{}]+)\\}");
            Matcher objMatcher = objPattern.matcher(itemsContent);
            while (objMatcher.find()) {
                String objStr = "{" + objMatcher.group(1) + "}";
                Map<String, Object> item = parseItemObject(objStr);
                if (item != null && !item.isEmpty()) {
                    items.add(item);
                }
            }
        } catch (Exception e) {
            log.warn("[PurchaseDocRecognize] Parse AI items failed: {}", e.getMessage());
        }

        return items;
    }

    private String extractJson(String raw) {
        // 剥离 markdown ```json ... ``` 包裹
        Pattern md = Pattern.compile("```(?:json)?\\s*([\\s\\S]*?)\\s*```");
        Matcher mdm = md.matcher(raw);
        if (mdm.find()) return mdm.group(1).trim();
        // 直接找第一个 { 到最后一个 }
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) return raw.substring(start, end + 1);
        return raw;
    }

    private Map<String, Object> parseItemObject(String objStr) {
        Map<String, Object> item = new HashMap<>();
        item.put("materialCode", extractStrField(objStr, "materialCode"));
        item.put("materialName", extractStrField(objStr, "materialName"));
        item.put("specifications", extractStrField(objStr, "specifications"));
        item.put("unit", extractStrField(objStr, "unit"));
        item.put("color", extractStrField(objStr, "color"));
        item.put("remark", extractStrField(objStr, "remark"));

        // 解析数量（数字类型）
        String qtyStr = extractNumField(objStr, "quantity");
        try {
            item.put("quantity", qtyStr != null ? Double.parseDouble(qtyStr) : null);
        } catch (NumberFormatException e) {
            item.put("quantity", null);
        }

        String priceStr = extractNumField(objStr, "unitPrice");
        try {
            item.put("unitPrice", priceStr != null ? Double.parseDouble(priceStr) : null);
        } catch (NumberFormatException e) {
            item.put("unitPrice", null);
        }

        return item;
    }

    private String extractStrField(String json, String field) {
        Pattern p = Pattern.compile("\"" + field + "\"\\s*:\\s*\"([^\"]*)\"");
        Matcher m = p.matcher(json);
        return m.find() ? m.group(1) : null;
    }

    private String extractNumField(String json, String field) {
        Pattern p = Pattern.compile("\"" + field + "\"\\s*:\\s*([0-9.]+)");
        Matcher m = p.matcher(json);
        return m.find() ? m.group(1) : null;
    }

    // ─────────────────────────────────────────────────────────────────
    // 与采购单明细匹配
    // ─────────────────────────────────────────────────────────────────

    /**
     * 将 AI 识别结果与订单下待收货的采购条目做匹配，
     * AI 识别到的物料名/编码 与 DB 中的物料名/编码 做模糊匹配。
     */
    private List<Map<String, Object>> matchWithPurchaseItems(
            List<Map<String, Object>> recognizedItems,
            String orderNo,
            Long tenantId) {

        // 拉取该订单未完成的采购条目
        List<MaterialPurchase> dbItems = new ArrayList<>();
        if (orderNo != null && !orderNo.isBlank()) {
            try {
                QueryWrapper<MaterialPurchase> qw = new QueryWrapper<>();
                qw.eq("tenant_id", tenantId);
                qw.eq("order_no", orderNo);
                qw.in("status", "pending", "partial");
                dbItems = materialPurchaseService.list(qw);
            } catch (Exception e) {
                log.warn("[PurchaseDocRecognize] Query purchase items failed: {}", e.getMessage());
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();

        for (Map<String, Object> recognized : recognizedItems) {
            String recCode = str(recognized.get("materialCode"));
            String recName = str(recognized.get("materialName"));

            // 按物料编码精确匹配 → 按物料名关键词模糊匹配
            MaterialPurchase matched = null;
            for (MaterialPurchase db : dbItems) {
                if (recCode != null && !recCode.isBlank()
                        && recCode.equalsIgnoreCase(db.getMaterialCode())) {
                    matched = db;
                    break;
                }
            }
            if (matched == null && recName != null && !recName.isBlank()) {
                for (MaterialPurchase db : dbItems) {
                    String dbName = db.getMaterialName() != null ? db.getMaterialName() : "";
                    if (dbName.contains(recName) || recName.contains(dbName)) {
                        matched = db;
                        break;
                    }
                }
            }

            Map<String, Object> row = new HashMap<>(recognized);
            row.put("matched", matched != null);
            row.put("purchaseId", matched != null ? matched.getId() : null);
            row.put("purchaseNo", matched != null ? matched.getPurchaseNo() : null);
            row.put("purchaseQty", matched != null ? matched.getPurchaseQuantity() : null);
            row.put("currentStatus", matched != null ? matched.getStatus() : null);
            result.add(row);
        }

        // 将 DB 中识别结果未覆盖的采购条目补充为 unmatched（便于前端展示）
        Set<String> matchedPurchaseIds = new HashSet<>();
        result.forEach(r -> {
            if (Boolean.TRUE.equals(r.get("matched"))) {
                matchedPurchaseIds.add(str(r.get("purchaseId")));
            }
        });
        for (MaterialPurchase db : dbItems) {
            String id = db.getId() != null ? db.getId().toString() : null;
            if (id != null && !matchedPurchaseIds.contains(id)) {
                Map<String, Object> unmatched = new HashMap<>();
                unmatched.put("matched", false);
                unmatched.put("purchaseId", db.getId());
                unmatched.put("purchaseNo", db.getPurchaseNo());
                unmatched.put("materialCode", db.getMaterialCode());
                unmatched.put("materialName", db.getMaterialName());
                unmatched.put("specifications", db.getSpecifications());
                unmatched.put("unit", db.getUnit());
                unmatched.put("purchaseQty", db.getPurchaseQuantity());
                unmatched.put("currentStatus", db.getStatus());
                unmatched.put("quantity", null);  // AI 未识别到
                unmatched.put("unrecognized", true);  // 标记：在单据中未找到
                result.add(unmatched);
            }
        }

        return result;
    }

    private String str(Object v) {
        return v != null ? v.toString().trim() : null;
    }

    private PurchaseOrderDoc resolveDoc(String docId, String orderNo) {
        Long tenantId = UserContext.tenantId();
        if (docId != null && !docId.isBlank()) {
            PurchaseOrderDoc doc = purchaseOrderDocService.getById(docId.trim());
            if (doc == null || !Objects.equals(doc.getTenantId(), tenantId)) {
                throw new IllegalArgumentException("采购单据不存在");
            }
            return doc;
        }
        if (orderNo != null && !orderNo.isBlank()) {
            List<PurchaseOrderDoc> docs = purchaseOrderDocService.listByOrderNo(tenantId, orderNo.trim());
            if (!docs.isEmpty()) {
                return docs.get(0);
            }
        }
        throw new IllegalArgumentException("未找到可用的采购单据记录");
    }

    private Map<String, Object> copyExecutionItem(Map<String, Object> item, String status, String message) {
        Map<String, Object> row = new LinkedHashMap<>(item);
        row.put("executionStatus", status);
        row.put("executionMessage", message);
        return row;
    }

    private Integer toInteger(Object value) {
        if (value == null) return null;
        if (value instanceof Number number) return number.intValue();
        try {
            return (int) Double.parseDouble(String.valueOf(value));
        } catch (Exception e) {
            return null;
        }
    }
}
