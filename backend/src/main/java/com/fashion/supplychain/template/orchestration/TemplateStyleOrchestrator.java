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

/**
 * 模板与款式编排器
 *
 * 职责：协调template模块与style模块之间的数据流转
 * 实现模板应用到款式的跨模块编排
 */
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

    /**
     * 将模板应用到目标款式
     *
     * @param templateId 模板ID
     * @param targetStyleId 目标款式ID
     * @param mode 应用模式（overwrite/merge）
     * @return 是否成功
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean applyTemplateToStyle(String templateId, Long targetStyleId, String mode) {
        if (templateId == null || templateId.trim().isEmpty()) {
            throw new IllegalArgumentException("templateId不能为空");
        }
        if (targetStyleId == null) {
            throw new IllegalArgumentException("targetStyleId不能为空");
        }

        // 查询目标款式
        StyleInfo style = styleInfoService.getById(targetStyleId);
        if (style == null) {
            throw new NoSuchElementException("目标款号不存在");
        }

        // 查询模板
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

        // 根据模板类型执行不同的应用逻辑
        boolean result = switch (templateType) {
            case "bom" -> applyBomTemplate(template, targetStyleId, overwrite);
            case "process" -> applyProcessTemplate(template, targetStyleId, overwrite);
            case "size" -> applySizeTemplate(template, targetStyleId, overwrite);
            default -> throw new IllegalArgumentException("不支持的模板类型: " + templateType);
        };

        log.info("模板应用完成: templateId={}, targetStyleId={}, result={}",
                templateId, targetStyleId, result);

        return result;
    }

    /**
     * 从款式创建模板
     *
     * @param sourceStyleNo 源款号
     * @param templateTypes 模板类型列表
     * @return 创建的模板列表
     */
    @Transactional(rollbackFor = Exception.class)
    public List<TemplateLibrary> createTemplateFromStyle(String sourceStyleNo, List<String> templateTypes) {
        if (sourceStyleNo == null || sourceStyleNo.trim().isEmpty()) {
            throw new IllegalArgumentException("sourceStyleNo不能为空");
        }

        // 查询源款式
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

    /**
     * 根据类型创建模板
     */
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
                    content = objectMapper.writeValueAsString(boms);
                }
                case "process" -> {
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
                    content = objectMapper.writeValueAsString(payload);
                }
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

    /**
     * 应用BOM模板
     */
    private boolean applyBomTemplate(TemplateLibrary template, Long targetStyleId, boolean overwrite) {
        try {
            String content = template.getTemplateContent();
            List<StyleBom> boms = new ArrayList<>();

            // 兼容两种模板格式：{"rows": [...]} 或直接 [...]
            if (content != null && content.trim().startsWith("{")) {
                // 新格式：{"rows": [...]}
                JsonNode root = objectMapper.readTree(content);
                JsonNode rowsNode = root.has("rows") ? root.get("rows") : root;
                if (rowsNode != null && rowsNode.isArray()) {
                    int index = 1;
                    for (JsonNode rowNode : rowsNode) {
                        StyleBom bom = objectMapper.convertValue(rowNode, StyleBom.class);
                        String materialCode = String.valueOf(bom.getMaterialCode() == null ? "" : bom.getMaterialCode()).trim();
                        if (materialCode.isEmpty()) {
                            String codePrefix = rowNode.has("codePrefix") ? rowNode.get("codePrefix").asText("") : "";
                            String base = String.valueOf(codePrefix == null ? "" : codePrefix).trim();
                            if (base.isEmpty()) {
                                base = String.valueOf(bom.getMaterialName() == null ? "BOM" : bom.getMaterialName()).trim();
                                if (base.isEmpty()) {
                                    base = "BOM";
                                }
                            }
                            bom.setMaterialCode(base + String.format("%03d", index));
                        }
                        boms.add(bom);
                        index++;
                    }
                }
            } else {
                // 旧格式：直接数组 [...]
                List<StyleBom> parsed = objectMapper.readValue(content, new TypeReference<List<StyleBom>>() {});
                int index = 1;
                for (StyleBom bom : parsed) {
                    String materialCode = String.valueOf(bom.getMaterialCode() == null ? "" : bom.getMaterialCode()).trim();
                    if (materialCode.isEmpty()) {
                        String base = String.valueOf(bom.getMaterialName() == null ? "BOM" : bom.getMaterialName()).trim();
                        if (base.isEmpty()) {
                            base = "BOM";
                        }
                        bom.setMaterialCode(base + String.format("%03d", index));
                    }
                    boms.add(bom);
                    index++;
                }
            }

            if (overwrite) {
                // 删除现有BOM
                styleBomService.lambdaUpdate()
                        .eq(StyleBom::getStyleId, targetStyleId)
                        .remove();
            }

            // 插入新BOM
            for (StyleBom bom : boms) {
                bom.setId(null);
                bom.setStyleId(targetStyleId);
                styleBomService.save(bom);
            }

            // BOM数据变更后清理缓存，避免前端立即刷新读到旧缓存
            styleBomService.clearBomCache(targetStyleId);

            return true;
        } catch (Exception e) {
            log.error("应用BOM模板失败", e);
            return false;
        }
    }

    /**
     * 应用工序模板
     */
    private boolean applyProcessTemplate(TemplateLibrary template, Long targetStyleId, boolean overwrite) {
        try {
            String content = template.getTemplateContent();
            List<StyleProcess> processes;

            if (content != null && content.trim().startsWith("{")) {
                JsonNode root = objectMapper.readTree(content);
                JsonNode stepsNode = root.has("steps") ? root.get("steps")
                        : (root.has("rows") ? root.get("rows") : root.get("data"));
                if (stepsNode == null || stepsNode.isMissingNode() || stepsNode.isNull()) {
                    processes = Collections.emptyList();
                } else {
                    processes = objectMapper.convertValue(stepsNode, new TypeReference<List<StyleProcess>>() {});
                }
            } else {
                processes = objectMapper.readValue(content, new TypeReference<List<StyleProcess>>() {});
            }

            if (overwrite) {
                // 删除现有工序
                styleProcessService.lambdaUpdate()
                        .eq(StyleProcess::getStyleId, targetStyleId)
                        .remove();
            }

            // 插入新工序
            for (StyleProcess process : processes) {
                process.setProcessName(fixMojibake(process.getProcessName()));
                process.setProgressStage(fixMojibake(process.getProgressStage()));
                process.setId(null);
                process.setStyleId(targetStyleId);
                styleProcessService.save(process);
            }

            return true;
        } catch (Exception e) {
            log.error("应用工序模板失败", e);
            return false;
        }
    }

    /**
     * 应用尺寸模板
     */
    private boolean applySizeTemplate(TemplateLibrary template, Long targetStyleId, boolean overwrite) {
        try {
            String content = template.getTemplateContent();
            List<StyleSize> sizes;

            if (content != null && content.trim().startsWith("{")) {
                JsonNode root = objectMapper.readTree(content);
                if (root.has("rows")) {
                    sizes = objectMapper.convertValue(root.get("rows"), new TypeReference<List<StyleSize>>() {});
                } else if (root.has("sizes") || root.has("parts")) {
                    sizes = new ArrayList<>();
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

                    JsonNode partsNode = root.get("parts");
                    if ((sizeNames.isEmpty()) && partsNode != null && partsNode.isArray() && partsNode.size() > 0) {
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

                    int sort = 1;
                    if (partsNode != null && partsNode.isArray()) {
                        for (JsonNode partNode : partsNode) {
                            String partName = partNode.path("partName").asText(null);
                            String measureMethod = partNode.path("measureMethod").asText(null);
                            BigDecimal tolerance = parseDecimal(partNode.get("tolerance"));
                            JsonNode valuesNode = partNode.get("values");

                            for (String sizeName : sizeNames) {
                                BigDecimal value = null;
                                if (valuesNode != null && valuesNode.isObject()) {
                                    JsonNode valueNode = valuesNode.get(sizeName);
                                    value = parseDecimal(valueNode);
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
                    }
                } else {
                    sizes = objectMapper.convertValue(root, new TypeReference<List<StyleSize>>() {});
                }
            } else {
                sizes = objectMapper.readValue(content, new TypeReference<List<StyleSize>>() {});
            }

            if (overwrite) {
                // 删除现有尺寸
                styleSizeService.lambdaUpdate()
                        .eq(StyleSize::getStyleId, targetStyleId)
                        .remove();
            }

            // 插入新尺寸
            for (StyleSize size : sizes) {
                size.setId(null);
                size.setStyleId(targetStyleId);
                styleSizeService.save(size);
            }

            return true;
        } catch (Exception e) {
            log.error("应用尺寸模板失败", e);
            return false;
        }
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

    /**
     * 批量应用BOM模板到款式
     *
     * @param templateId 模板ID
     * @param targetStyleIds 目标款式ID列表
     * @param overwrite 是否覆盖
     * @return 成功应用的款式数
     */
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

    /**
     * 批量应用工序模板到款式
     *
     * @param templateId 模板ID
     * @param targetStyleIds 目标款式ID列表
     * @param overwrite 是否覆盖
     * @return 成功应用的款式数
     */
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
