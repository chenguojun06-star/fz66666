package com.fashion.supplychain.template.orchestration;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
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

    @Autowired
    private com.fashion.supplychain.style.helper.StyleStageCompletionHelper styleStageCompletionHelper;

    @Transactional(rollbackFor = Exception.class)
    public boolean applyTemplateToStyle(String templateId, Long targetStyleId, String mode) {
        if (templateId == null || templateId.trim().isEmpty()) {
            throw new IllegalArgumentException("templateId不能为空");
        }
        if (targetStyleId == null) {
            throw new IllegalArgumentException("targetStyleId不能为空");
        }

        // P0 铁律4：多租户隔离 — 必须校验租户上下文，防止跨租户应用模板
        TenantAssert.assertTenantContext();

        StyleInfo style = styleInfoService.getById(targetStyleId);
        if (style == null) {
            throw new NoSuchElementException("目标款号不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(style.getTenantId(), "款式");

        TemplateLibrary template = templateLibraryService.getById(templateId);
        if (template == null) {
            throw new NoSuchElementException("模板不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(template.getTenantId(), "模板");

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

        // P0 铁律4：多租户隔离 — 必须校验租户上下文，防止跨租户从款式创建模板
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();

        StyleInfo style = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStyleNo, sourceStyleNo.trim())
                .eq(StyleInfo::getTenantId, tenantId)
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
        String name = sourceStyleNo + " " + toChineseType(templateType) + "模板";
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
        // D-264：按工序编码排序后再序列化——库表返回顺序不保证，乱序数组会让
        // 模板编辑页看着正常（按编码排序显示），导入到款式时却按数组序重排编号导致乱套
        processes.sort(Comparator.comparingInt(p -> parseCodeOrdinal(p == null ? null : p.getProcessCode())));
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

        if (boms.isEmpty()) {
            throw new IllegalStateException("BOM模板内容为空或解析失败，拒绝应用（templateId=" + template.getId() + "）");
        }

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

        // 自动回填 BOM 开始时间（导入模板相当于开始 BOM 配置）
        styleStageCompletionHelper.autoStartStage(targetStyleId, "bom");

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

        if (processes.isEmpty()) {
            throw new IllegalStateException("工序模板内容为空或解析失败，拒绝应用（templateId=" + template.getId() + "，contentLength=" + (template.getTemplateContent() == null ? 0 : template.getTemplateContent().length()) + "）");
        }

        // D-264：模板内容的存储顺序可能与编码顺序不一致（从款式生成模板时按库表返回序序列化），
        // 而模板编辑页按编码排序显示——直接按数组序导入/重排编号，会出现"01裁剪导入后变 05"的乱序。
        // 导入前先按工序编码排成与编辑页一致的顺序，编码与工序名的配对保持不变。
        processes.sort(Comparator.comparingInt(p -> parseCodeOrdinal(p == null ? null : p.getProcessCode())));

        log.info("应用工序模板: templateId={}, targetStyleId={}, parsedCount={}, overwrite={}",
                template.getId(), targetStyleId, processes.size(), overwrite);

        // D-252：已存在工序的「同名同阶段」索引，追加模式用于幂等去重
        java.util.Set<String> existingKeys = new java.util.HashSet<>();
        int nextSort;

        if (overwrite) {
            styleProcessService.lambdaUpdate()
                    .eq(StyleProcess::getStyleId, targetStyleId)
                    .remove();
            nextSort = 1;
        } else {
            List<StyleProcess> existing = styleProcessService.lambdaQuery()
                    .eq(StyleProcess::getStyleId, targetStyleId)
                    .list();
            if (existing != null) {
                for (StyleProcess e : existing) {
                    if (e != null) existingKeys.add(processKey(e.getProcessName(), e.getProgressStage()));
                }
                nextSort = existing.size() + 1;
            } else {
                nextSort = 1;
            }
        }

        int added = 0;
        for (StyleProcess process : processes) {
            String name = fixMojibake(process.getProcessName());
            String stage = fixMojibake(process.getProgressStage());
            // 追加模式：跳过与现有工序同名同阶段的条目，保证重复导入幂等
            if (!overwrite && existingKeys.contains(processKey(name, stage))) {
                continue;
            }
            process.setProcessName(name);
            process.setProgressStage(stage);
            process.setId(null);
            process.setStyleId(targetStyleId);
            if (!overwrite) {
                // 追加时按续接序号重排，避免与现有工序的 sortOrder / processCode 冲突
                // （否则前端保存会因「工序编码不能重复」校验失败，等于导入白做）
                process.setSortOrder(nextSort);
                process.setProcessCode(String.format("%02d", nextSort));
                nextSort++;
                existingKeys.add(processKey(name, stage));
            }
            styleProcessService.save(process);
            added++;
        }

        log.info("工序模板应用完成: templateId={}, targetStyleId={}, overwrite={}, 新增={}, 跳过重复={}",
                template.getId(), targetStyleId, overwrite, added, processes.size() - added);

        // 自动回填工序开始时间（导入模板相当于开始工序配置）
        styleStageCompletionHelper.autoStartStage(targetStyleId, "process");

        return true;
    }

    /**
     * 工序去重键：工序名称 + 所属阶段（归一化，忽略大小写与首尾空格）。
     *
     * <p>D-252：追加模式（overwrite=false）下用于跳过已存在工序。
     * 此前追加模式既不去重也不重排编码，重复导入同一模板会产生重复工序，
     * 且 processCode 与现有冲突会让前端「工序编码不能重复」校验失败。
     */
    private String processKey(String processName, String progressStage) {
        String n = processName == null ? "" : processName.trim().toLowerCase();
        String s = progressStage == null ? "" : progressStage.trim().toLowerCase();
        return n + "|" + s;
    }

    /** 工序编码序号：取编码中的数字（01→1），无数字的排最后（排序稳定） */
    private int parseCodeOrdinal(String code) {
        if (code == null) {
            return Integer.MAX_VALUE;
        }
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\\d+").matcher(code);
        return matcher.find() ? Integer.parseInt(matcher.group()) : Integer.MAX_VALUE;
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

        if (sizes.isEmpty()) {
            throw new IllegalStateException("尺码模板内容为空或解析失败，拒绝应用（templateId=" + template.getId() + "）");
        }

        if (overwrite) {
            styleSizeService.lambdaUpdate()
                    .eq(StyleSize::getStyleId, targetStyleId)
                    .remove();
            for (StyleSize size : sizes) {
                size.setId(null);
                size.setStyleId(targetStyleId);
                styleSizeService.save(size);
            }
            return true;
        }

        // 智能导入（merge）：按「部位名」匹配已有行，只回填空缺值，绝不重复添加。
        // 旧行为按「部位+码数语义键」追加，码数写法稍有差异就在同一部位下再插一份，
        // 用户看到的是"又多了一份"，而已填的数值也没有被利用。
        List<StyleSize> existing = styleSizeService.lambdaQuery()
                .eq(StyleSize::getStyleId, targetStyleId)
                .list();
        Map<String, Map<String, StyleSize>> existingByPart = new HashMap<>();
        for (StyleSize item : existing) {
            existingByPart.computeIfAbsent(normalizePartKey(item.getPartName()), k -> new HashMap<>())
                    .put(sizeDedupeKey(item.getSizeName()), item);
        }

        // 目标款规范码数：优先取款式基础码数（sizeColorConfig.sizes），兜底并入已有行的码数。
        // D-264：merge 导入不得把模板自带的、目标款没有的码数列"拖进来"
        // （此前导入别的款后凭空多出 XXL 列，而目标款现有码数全部还是空的）。
        Set<String> canonicalSizeKeys = new LinkedHashSet<>();
        StyleInfo targetStyle = styleInfoService.getById(targetStyleId);
        if (targetStyle != null && StringUtils.hasText(targetStyle.getSizeColorConfig())) {
            try {
                JsonNode cfg = objectMapper.readTree(targetStyle.getSizeColorConfig());
                if (cfg.has("sizes") && cfg.get("sizes").isArray()) {
                    for (JsonNode s : cfg.get("sizes")) {
                        String key = sizeDedupeKey(s.asText());
                        if (!key.isEmpty()) {
                            canonicalSizeKeys.add(key);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("[尺寸模板导入] 解析款式基础码数失败 targetStyleId={}", targetStyleId);
            }
        }
        for (StyleSize item : existing) {
            String key = sizeDedupeKey(item.getSizeName());
            if (!key.isEmpty()) {
                canonicalSizeKeys.add(key);
            }
        }

        int filledRows = 0;
        int addedParts = 0;
        int unmatchedRows = 0;
        int foreignSizeRows = 0;
        for (StyleSize size : sizes) {
            String partKey = normalizePartKey(size.getPartName());
            Map<String, StyleSize> partRows = partKey.isEmpty() ? null : existingByPart.get(partKey);

            // 部位不存在：整行新增（带入模板的码数与数值），但仅限目标款规范码数内的码
            if (partRows == null || partRows.isEmpty()) {
                String sizeKey = sizeDedupeKey(size.getSizeName());
                if (!canonicalSizeKeys.isEmpty() && (sizeKey.isEmpty() || !canonicalSizeKeys.contains(sizeKey))) {
                    foreignSizeRows++;
                    continue;
                }
                size.setId(null);
                size.setStyleId(targetStyleId);
                styleSizeService.save(size);
                existingByPart.put(partKey, new HashMap<>());
                addedParts++;
                continue;
            }

            // 部位已存在：按码数语义键定位对应格，只回填空缺（null/0 视为未填）
            String sizeKey = sizeDedupeKey(size.getSizeName());
            StyleSize target = sizeKey.isEmpty() ? null : partRows.get(sizeKey);
            if (target == null) {
                unmatchedRows++;
                continue;
            }
            boolean updated = false;
            if (isEmptyMeasurement(target.getStandardValue()) && !isEmptyMeasurement(size.getStandardValue())) {
                target.setStandardValue(size.getStandardValue());
                updated = true;
            }
            if (!StringUtils.hasText(target.getMeasureMethod()) && StringUtils.hasText(size.getMeasureMethod())) {
                target.setMeasureMethod(size.getMeasureMethod());
                updated = true;
            }
            if (!StringUtils.hasText(target.getTolerance()) && StringUtils.hasText(size.getTolerance())) {
                target.setTolerance(size.getTolerance());
                updated = true;
            }
            if (updated) {
                styleSizeService.updateById(target);
                filledRows++;
            }
        }

        log.info("尺寸模板智能导入完成（templateId={}, targetStyleId={}）：回填 {} 行空缺、新增 {} 个部位、{} 行码数不对应跳过、{} 行目标款没有的码数丢弃",
                template.getId(), targetStyleId, filledRows, addedParts, unmatchedRows, foreignSizeRows);
        return true;
    }

    /** 部位名归一化：去首尾空格（含全角空格），作为模板行与已有行的匹配键 */
    private String normalizePartKey(String partName) {
        return String.valueOf(partName == null ? "" : partName.trim().replace("\u3000", " ").trim());
    }

    /** 测量值空缺判定：null 或 0 都视为未填（前端空格子按 0 存） */
    private boolean isEmptyMeasurement(BigDecimal value) {
        return value == null || value.compareTo(BigDecimal.ZERO) == 0;
    }

    /** 尺码语义归一化键：忽略型体后缀（国标 A/B/C）与分隔符，S(160/76A) 与 S(160/76) 同键 */
    private String sizeDedupeKey(String name) {
        if (name == null) {
            return "";
        }
        String raw = name.trim().toUpperCase().replaceAll("\\s+", "");
        if (raw.isEmpty()) {
            return "";
        }
        java.util.regex.Matcher letterMatcher = java.util.regex.Pattern.compile("^[A-Z]+").matcher(raw);
        String letters = letterMatcher.find() ? letterMatcher.group() : "";
        StringBuilder digits = new StringBuilder();
        java.util.regex.Matcher digitMatcher = java.util.regex.Pattern.compile("\\d+").matcher(raw);
        while (digitMatcher.find()) {
            if (digits.length() > 0) {
                digits.append('-');
            }
            digits.append(digitMatcher.group());
        }
        java.util.regex.Matcher chineseMatcher = java.util.regex.Pattern.compile("[\\u4e00-\\u9fa5]+").matcher(raw);
        String chinese = chineseMatcher.find() ? chineseMatcher.group() : "";

        List<String> segments = new ArrayList<>();
        if (!letters.isEmpty()) {
            segments.add(letters);
        }
        if (digits.length() > 0) {
            segments.add(digits.toString());
        }
        if (!chinese.isEmpty()) {
            segments.add(chinese);
        }
        return String.join("|", segments);
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

    private static String toChineseType(String templateType) {
        return switch (templateType) {
            case "bom" -> "BOM";
            case "size" -> "尺寸";
            case "process" -> "工序进度单价";
            case "process_price" -> "工序单价";
            case "progress" -> "进度";
            default -> templateType;
        };
    }
}
