package com.fashion.supplychain.template.orchestration;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.entity.StyleSize;
import com.fashion.supplychain.style.entity.StyleSizePrice;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.style.service.StyleSizeService;
import com.fashion.supplychain.style.service.StyleSizePriceService;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Slf4j
@Service
public class TemplateStyleOrchestrator {

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private StyleSizeService styleSizeService;

    @Autowired
    private StyleSizePriceService styleSizePriceService;

    @Autowired
    private ObjectMapper objectMapper;

    @Transactional(rollbackFor = Exception.class)
    public boolean applyTemplateToStyle(String templateId, Long targetStyleId, String mode) {
        if (templateId == null || templateId.trim().isEmpty()) {
            throw new IllegalArgumentException("templateId不能为空");
        }
        if (targetStyleId == null) {
            throw new IllegalArgumentException("targetStyleId不能为空");
        }

        StyleInfo style = styleInfoService.getById(targetStyleId);
        if (style == null) {
            throw new NoSuchElementException("目标款号不存在");
        }

        TemplateLibrary template = templateLibraryService.getById(templateId);
        if (template == null) {
            throw new NoSuchElementException("模板不存在");
        }

        String templateType = template.getTemplateType();
        if (templateType == null) {
            throw new IllegalArgumentException("模板类型不能为空");
        }

        String m = mode == null ? "" : mode.trim().toLowerCase();
        boolean overwrite = "overwrite".equals(m) || "cover".equals(m) || "true".equals(m);

        log.info("开始应用模板到款式: templateId={}, targetStyleId={}, templateType={}, mode={}",
                templateId, targetStyleId, templateType, mode);

        boolean result;
        try {
            result = switch (templateType) {
                case "bom" -> applyBomTemplate(template, targetStyleId, overwrite);
                case "process" -> applyProcessTemplate(template, targetStyleId, overwrite);
                case "size" -> applySizeTemplate(template, targetStyleId, overwrite);
                default -> throw new IllegalArgumentException("不支持的模板类型: " + templateType);
            };
        } catch (Exception e) {
            log.error("应用模板失败: templateId={}, targetStyleId={}, type={}", templateId, targetStyleId, templateType, e);
            throw new RuntimeException("应用模板失败: " + templateType, e);
        }

        log.info("模板应用完成: templateId={}, targetStyleId={}, result={}",
                templateId, targetStyleId, result);

        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public List<TemplateLibrary> createTemplateFromStyle(String sourceStyleNo, List<String> templateTypes) {
        if (sourceStyleNo == null || sourceStyleNo.trim().isEmpty()) {
            throw new IllegalArgumentException("sourceStyleNo不能为空");
        }

        StyleInfo style = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStyleNo, sourceStyleNo.trim())
                .one();
        if (style == null || style.getId() == null) {
            throw new NoSuchElementException("款号不存在: " + sourceStyleNo);
        }

        log.info("开始从款式创建模板: sourceStyleNo={}, templateTypes={}",
                sourceStyleNo, templateTypes);

        List<TemplateLibrary> created = new ArrayList<>();

        if (templateTypes == null || templateTypes.isEmpty()) {
            templateTypes = List.of("bom", "process", "size");
        }

        for (String type : templateTypes) {
            try {
                TemplateLibrary template = createTemplateByType(sourceStyleNo, style.getId(), type);
                if (template != null) {
                    created.add(template);
                }
            } catch (Exception e) {
                log.error("创建模板失败: sourceStyleNo={}, type={}", sourceStyleNo, type, e);
            }
        }

        log.info("模板创建完成: sourceStyleNo={}, createdCount={}",
                sourceStyleNo, created.size());

        return created;
    }

    private TemplateLibrary createTemplateByType(String sourceStyleNo, Long styleId, String templateType) {
        String key = sourceStyleNo + "_" + templateType;
        String name = sourceStyleNo + " " + templateType + " 模板";
        String content = "";

        try {
            switch (templateType) {
                case "bom" -> {
                    List<StyleBom> boms = styleBomService.lambdaQuery()
                            .eq(StyleBom::getStyleId, styleId)
                            .list();
                    boms.forEach(bom -> bom.setGroupName(null));
                    content = objectMapper.writeValueAsString(boms);
                }
                case "process" -> content = serializeProcessTemplate(styleId);
                case "size" -> {
                    List<StyleSize> sizes = styleSizeService.lambdaQuery()
                            .eq(StyleSize::getStyleId, styleId)
                            .list();
                    content = objectMapper.writeValueAsString(sizes);
                }
                default -> {
                    log.warn("未知的模板类型: {}", templateType);
                    return null;
                }
            }
        } catch (Exception e) {
            log.error("序列化模板内容失败: sourceStyleNo={}, type={}", sourceStyleNo, templateType, e);
            return null;
        }

        TemplateLibrary template = new TemplateLibrary();
        template.setTemplateType(templateType);
        template.setTemplateKey(key);
        template.setTemplateName(name);
        template.setTemplateContent(content);
        template.setSourceStyleNo(sourceStyleNo);
        template.setLocked(1);

        boolean saved = templateLibraryService.upsertTemplate(template);
        if (saved) {
            return template;
        }
        return null;
    }

    private String serializeProcessTemplate(Long styleId) throws Exception {
        List<StyleProcess> processes = styleProcessService.lambdaQuery()
                .eq(StyleProcess::getStyleId, styleId)
                .list();
        List<StyleSizePrice> sizePrices = styleSizePriceService.lambdaQuery()
                .eq(StyleSizePrice::getStyleId, styleId)
                .list();

        Map<String, Map<String, BigDecimal>> priceMap = new HashMap<>();
        Set<String> sizeSet = new LinkedHashSet<>();
        for (StyleSizePrice sp : sizePrices) {
            if (sp == null) continue;
            String pCode = StringUtils.hasText(sp.getProcessCode()) ? sp.getProcessCode().trim() : "";
            String size = StringUtils.hasText(sp.getSize()) ? sp.getSize().trim().toUpperCase() : "";
            if (!StringUtils.hasText(pCode) || !StringUtils.hasText(size)) continue;
            sizeSet.add(size);
            priceMap.computeIfAbsent(pCode, k -> new HashMap<>()).put(size, sp.getPrice());
        }

        List<Map<String, Object>> steps = new ArrayList<>();
        for (StyleProcess p : processes) {
            Map<String, Object> row = new HashMap<>();
            row.put("processCode", p.getProcessCode());
            row.put("processName", p.getProcessName());
            row.put("progressStage", p.getProgressStage());
            row.put("machineType", p.getMachineType());
            row.put("standardTime", p.getStandardTime());
            row.put("unitPrice", p.getPrice());
            Map<String, BigDecimal> sizePrice = priceMap.get(StringUtils.hasText(p.getProcessCode()) ? p.getProcessCode().trim() : "");
            if (sizePrice != null && !sizePrice.isEmpty()) {
                row.put("sizePrices", sizePrice);
            }
            steps.add(row);
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("steps", steps);
        if (!sizeSet.isEmpty()) {
            payload.put("sizes", new ArrayList<>(sizeSet));
        }
        return objectMapper.writeValueAsString(payload);
    }

    private boolean applyBomTemplate(TemplateLibrary template, Long targetStyleId, boolean overwrite) throws Exception {
        List<StyleBom> boms = parseBomContent(template.getTemplateContent());

        if (overwrite) {
            styleBomService.lambdaUpdate()
                    .eq(StyleBom::getStyleId, targetStyleId)
                    .remove();
        }

        for (StyleBom bom : boms) {
            bom.setId(null);
            bom.setStyleId(targetStyleId);
            styleBomService.save(bom);
        }

        styleBomService.clearBomCache(targetStyleId);
        return true;
    }

    private List<StyleBom> parseBomContent(String content) throws Exception {
        List<StyleBom> boms = new ArrayList<>();
        if (content == null || content.trim().isEmpty()) {
            return boms;
        }

        if (content.trim().startsWith("{")) {
            JsonNode root = objectMapper.readTree(content);
            JsonNode rowsNode = root.has("rows") ? root.get("rows") : root;
            if (rowsNode != null && rowsNode.isArray()) {
                int index = 1;
                for (JsonNode rowNode : rowsNode) {
                    StyleBom bom = objectMapper.convertValue(rowNode, StyleBom.class);
                    fillMissingMaterialCode(bom, rowNode, index);
                    boms.add(bom);
                    index++;
                }
            }
        } else {
            List<StyleBom> parsed = objectMapper.readValue(content, new TypeReference<List<StyleBom>>() {});
            int index = 1;
            for (StyleBom bom : parsed) {
                fillMissingMaterialCode(bom, null, index);
                boms.add(bom);
                index++;
            }
        }
        return boms;
    }

    private void fillMissingMaterialCode(StyleBom bom, JsonNode rowNode, int index) {
        String materialCode = String.valueOf(bom.getMaterialCode() == null ? "" : bom.getMaterialCode()).trim();
        if (!materialCode.isEmpty()) return;

        String base = "";
        if (rowNode != null && rowNode.has("codePrefix")) {
            base = String.valueOf(rowNode.get("codePrefix").asText("") == null ? "" : rowNode.get("codePrefix").asText("")).trim();
        }
        if (base.isEmpty()) {
            base = String.valueOf(bom.getMaterialName() == null ? "BOM" : bom.getMaterialName()).trim();
            if (base.isEmpty()) {
                base = "BOM";
            }
        }
        bom.setMaterialCode(base + String.format("%03d", index));
    }

    private boolean applyProcessTemplate(TemplateLibrary template, Long targetStyleId, boolean overwrite) throws Exception {
        List<StyleProcess> processes = parseProcessContent(template.getTemplateContent());

        if (overwrite) {
            styleProcessService.lambdaUpdate()
                    .eq(StyleProcess::getStyleId, targetStyleId)
                    .remove();
        }

        for (StyleProcess process : processes) {
            process.setProcessName(fixMojibake(process.getProcessName()));
            process.setProgressStage(fixMojibake(process.getProgressStage()));
            process.setId(null);
            process.setStyleId(targetStyleId);
            styleProcessService.save(process);
        }

        return true;
    }

    private List<StyleProcess> parseProcessContent(String content) throws Exception {
        if (content == null || content.trim().isEmpty()) {
            return Collections.emptyList();
        }

        if (content.trim().startsWith("{")) {
            JsonNode root = objectMapper.readTree(content);
            JsonNode stepsNode = root.has("steps") ? root.get("steps")
                    : (root.has("rows") ? root.get("rows") : root.get("data"));
            if (stepsNode == null || stepsNode.isMissingNode() || stepsNode.isNull()) {
                return Collections.emptyList();
            }
            return objectMapper.convertValue(stepsNode, new TypeReference<List<StyleProcess>>() {});
        } else {
            return objectMapper.readValue(content, new TypeReference<List<StyleProcess>>() {});
        }
    }

    private boolean applySizeTemplate(TemplateLibrary template, Long targetStyleId, boolean overwrite) throws Exception {
        List<StyleSize> sizes = parseSizeContent(template.getTemplateContent());

        if (overwrite) {
            styleSizeService.lambdaUpdate()
                    .eq(StyleSize::getStyleId, targetStyleId)
                    .remove();
        }

        for (StyleSize size : sizes) {
            size.setId(null);
            size.setStyleId(targetStyleId);
            styleSizeService.save(size);
        }

        return true;
    }

    private List<StyleSize> parseSizeContent(String content) throws Exception {
        if (content == null || content.trim().isEmpty()) {
            return Collections.emptyList();
        }

        if (!content.trim().startsWith("{")) {
            return objectMapper.readValue(content, new TypeReference<List<StyleSize>>() {});
        }

        JsonNode root = objectMapper.readTree(content);

        if (root.has("rows")) {
            return objectMapper.convertValue(root.get("rows"), new TypeReference<List<StyleSize>>() {});
        }

        if (root.has("sizes") || root.has("parts")) {
            return parseSizeFromPartsFormat(root);
        }

        return objectMapper.convertValue(root, new TypeReference<List<StyleSize>>() {});
    }

    private List<StyleSize> parseSizeFromPartsFormat(JsonNode root) {
        List<StyleSize> sizes = new ArrayList<>();
        List<String> sizeNames = extractSizeNames(root);

        JsonNode partsNode = root.get("parts");
        if (partsNode == null || !partsNode.isArray() || partsNode.isEmpty()) {
            return sizes;
        }

        int sort = 1;
        for (JsonNode partNode : partsNode) {
            String partName = partNode.path("partName").asText(null);
            String measureMethod = partNode.path("measureMethod").asText(null);
            String tolerance = partNode.path("tolerance").asText(null);
            JsonNode valuesNode = partNode.get("values");

            for (String sizeName : sizeNames) {
                BigDecimal value = null;
                if (valuesNode != null && valuesNode.isObject()) {
                    value = parseDecimal(valuesNode.get(sizeName));
                }

                StyleSize size = new StyleSize();
                size.setPartName(partName);
                size.setSizeName(sizeName);
                size.setMeasureMethod(measureMethod);
                size.setTolerance(tolerance);
                size.setStandardValue(value);
                size.setSort(sort++);
                sizes.add(size);
            }
        }
        return sizes;
    }

    private List<String> extractSizeNames(JsonNode root) {
        List<String> sizeNames = new ArrayList<>();
        JsonNode sizesNode = root.get("sizes");
        if (sizesNode != null && sizesNode.isArray()) {
            for (JsonNode sn : sizesNode) {
                String name = sn == null || sn.isNull() ? "" : sn.asText("").trim();
                if (!name.isEmpty()) {
                    sizeNames.add(name);
                }
            }
        }

        if (sizeNames.isEmpty()) {
            JsonNode partsNode = root.get("parts");
            if (partsNode != null && partsNode.isArray() && partsNode.size() > 0) {
                JsonNode first = partsNode.get(0);
                JsonNode valuesNode = first == null ? null : first.get("values");
                if (valuesNode != null && valuesNode.isObject()) {
                    Iterator<String> fields = valuesNode.fieldNames();
                    while (fields.hasNext()) {
                        String name = String.valueOf(fields.next()).trim();
                        if (!name.isEmpty()) {
                            sizeNames.add(name);
                        }
                    }
                }
            }
        }
        return sizeNames;
    }

    private BigDecimal parseDecimal(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isNumber()) {
            return new BigDecimal(node.asText());
        }
        String text = node.asText(null);
        if (text == null || text.trim().isEmpty()) {
            return null;
        }
        try {
            return new BigDecimal(text.trim());
        } catch (Exception e) {
            return null;
        }
    }

    private String fixMojibake(String text) {
        if (text == null) {
            return null;
        }
        String trimmed = text.trim();
        if (trimmed.isEmpty()) {
            return text;
        }
        if (!looksMojibake(trimmed)) {
            return text;
        }
        try {
            return new String(trimmed.getBytes(StandardCharsets.ISO_8859_1), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return text;
        }
    }

    private boolean looksMojibake(String text) {
        boolean hasCjk = false;
        boolean hasLatin1 = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c >= '\u4e00' && c <= '\u9fff') {
                hasCjk = true;
                break;
            }
            if (c >= '\u00c0' && c <= '\u00ff') {
                hasLatin1 = true;
            }
        }
        return !hasCjk && hasLatin1;
    }

    @Transactional(rollbackFor = Exception.class)
    public int batchApplyBomTemplate(String templateId, List<Long> targetStyleIds, boolean overwrite) {
        if (templateId == null || templateId.trim().isEmpty()) {
            throw new IllegalArgumentException("templateId不能为空");
        }
        if (targetStyleIds == null || targetStyleIds.isEmpty()) {
            return 0;
        }

        TemplateLibrary template = templateLibraryService.getById(templateId);
        if (template == null) {
            throw new NoSuchElementException("模板不存在");
        }

        if (!"bom".equals(template.getTemplateType())) {
            throw new IllegalArgumentException("模板类型必须是bom");
        }

        int successCount = 0;
        String mode = overwrite ? "overwrite" : "merge";

        for (Long styleId : targetStyleIds) {
            try {
                boolean result = applyTemplateToStyle(templateId, styleId, mode);
                if (result) {
                    successCount++;
                }
            } catch (Exception e) {
                log.error("应用BOM模板失败: templateId={}, styleId={}", templateId, styleId, e);
            }
        }

        log.info("批量应用BOM模板完成: templateId={}, targetCount={}, successCount={}",
                templateId, targetStyleIds.size(), successCount);

        return successCount;
    }

    @Transactional(rollbackFor = Exception.class)
    public int batchApplyProcessTemplate(String templateId, List<Long> targetStyleIds, boolean overwrite) {
        if (templateId == null || templateId.trim().isEmpty()) {
            throw new IllegalArgumentException("templateId不能为空");
        }
        if (targetStyleIds == null || targetStyleIds.isEmpty()) {
            return 0;
        }

        TemplateLibrary template = templateLibraryService.getById(templateId);
        if (template == null) {
            throw new NoSuchElementException("模板不存在");
        }

        String templateType = template.getTemplateType();
        if (!"process".equals(templateType) && !"process_price".equals(templateType)) {
            throw new IllegalArgumentException("模板类型必须是process或process_price");
        }

        int successCount = 0;
        String mode = overwrite ? "overwrite" : "merge";

        for (Long styleId : targetStyleIds) {
            try {
                boolean result = applyTemplateToStyle(templateId, styleId, mode);
                if (result) {
                    successCount++;
                }
            } catch (Exception e) {
                log.error("应用工序模板失败: templateId={}, styleId={}", templateId, styleId, e);
            }
        }

        log.info("批量应用工序模板完成: templateId={}, targetCount={}, successCount={}",
                templateId, targetStyleIds.size(), successCount);

        return successCount;
    }
}
