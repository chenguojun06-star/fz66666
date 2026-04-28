package com.fashion.supplychain.template.resolver;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.ProcessSynonymMapping;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.helper.TemplateParseUtils;
import com.fashion.supplychain.template.helper.TemplateStageNameHelper;
import com.fashion.supplychain.template.mapper.TemplateLibraryMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

@Component
@Slf4j
public class TemplateResolver {

    private static final Pattern DECIMAL_PATTERN = Pattern.compile("[+-]?\\d+(\\.\\d+)?");
    private static final List<String> STAGE_ORDER = List.of("采购", "裁剪", "二次工艺", "车缝", "尾部", "入库");

    private final Cache<String, TemplateLibrary> progressTemplateCache = Caffeine.newBuilder()
            .expireAfterWrite(10, TimeUnit.MINUTES)
            .maximumSize(200)
            .build();

    private final Cache<String, TemplateLibrary> processPriceTemplateCache = Caffeine.newBuilder()
            .expireAfterWrite(10, TimeUnit.MINUTES)
            .maximumSize(200)
            .build();

    private final Cache<String, List<Map<String, Object>>> progressNodeUnitPriceCache = Caffeine.newBuilder()
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .maximumSize(500)
            .build();

    @Autowired
    private TemplateLibraryMapper templateLibraryMapper;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private TemplateStageNameHelper stageNameHelper;

    @Autowired
    private ProcessParentMappingService processParentMappingService;

    private String buildTemplateCacheKey(String styleNo) {
        Long tenantId = UserContext.tenantId();
        String tenantPart = tenantId == null ? "superadmin" : "t" + tenantId;
        String stylePart = StringUtils.hasText(styleNo) ? styleNo.trim() : "__default__";
        return tenantPart + ":" + stylePart;
    }

    public TemplateLibrary resolveProgressTemplate(String styleNo) {
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        String cacheKey = buildTemplateCacheKey(sn);
        TemplateLibrary cached = progressTemplateCache.getIfPresent(cacheKey);
        if (cached != null) {
            return cached;
        }
        TemplateLibrary tpl = null;
        try {
            if (StringUtils.hasText(sn)) {
                tpl = templateLibraryMapper.selectOne(new LambdaQueryWrapper<TemplateLibrary>()
                        .eq(TemplateLibrary::getTemplateType, "progress")
                        .eq(TemplateLibrary::getSourceStyleNo, sn)
                        .orderByDesc(TemplateLibrary::getUpdateTime)
                        .orderByDesc(TemplateLibrary::getCreateTime)
                        .last("limit 1"));
            }

            if (tpl == null) {
                tpl = templateLibraryMapper.selectOne(new LambdaQueryWrapper<TemplateLibrary>()
                        .eq(TemplateLibrary::getTemplateType, "progress")
                        .eq(TemplateLibrary::getTemplateKey, "default")
                        .orderByDesc(TemplateLibrary::getUpdateTime)
                        .orderByDesc(TemplateLibrary::getCreateTime)
                        .last("limit 1"));
            }

            if (tpl == null) {
                tpl = templateLibraryMapper.selectOne(new LambdaQueryWrapper<TemplateLibrary>()
                        .eq(TemplateLibrary::getTemplateType, "progress")
                        .orderByDesc(TemplateLibrary::getUpdateTime)
                        .orderByDesc(TemplateLibrary::getCreateTime)
                        .last("limit 1"));
            }
        } catch (Exception e) {
            log.warn("resolveProgressTemplate failed: styleNo={}", sn, e);
        }

        if (tpl != null) {
            progressTemplateCache.put(cacheKey, tpl);
        }
        return tpl;
    }

    public TemplateLibrary resolveProcessPriceTemplate(String styleNo) {
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        if (!StringUtils.hasText(sn)) {
            return null;
        }
        String cacheKey = buildTemplateCacheKey(sn);
        TemplateLibrary cached = processPriceTemplateCache.getIfPresent(cacheKey);
        if (cached != null) {
            return cached;
        }
        TemplateLibrary tpl = null;
        try {
            tpl = templateLibraryMapper.selectOne(new LambdaQueryWrapper<TemplateLibrary>()
                    .eq(TemplateLibrary::getTemplateType, "process_price")
                    .eq(TemplateLibrary::getSourceStyleNo, sn)
                    .orderByDesc(TemplateLibrary::getUpdateTime)
                    .orderByDesc(TemplateLibrary::getCreateTime)
                    .last("limit 1"));
        } catch (Exception e) {
            log.warn("resolveProcessPriceTemplate failed: styleNo={}", sn, e);
        }

        if (tpl != null) {
            processPriceTemplateCache.put(cacheKey, tpl);
        }
        return tpl;
    }

    public List<String> resolveProgressNodes(String styleNo) {
        TemplateLibrary tpl = resolveProgressTemplate(styleNo);
        if (tpl == null || !StringUtils.hasText(tpl.getTemplateContent())) {
            return new ArrayList<>();
        }

        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : "";
        boolean isStyleSpecific = StringUtils.hasText(sn) &&
                sn.equalsIgnoreCase(StringUtils.hasText(tpl.getSourceStyleNo())
                        ? tpl.getSourceStyleNo().trim() : "");

        List<String> nodes = new ArrayList<>();
        try {
            com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(tpl.getTemplateContent());
            com.fasterxml.jackson.databind.JsonNode arr = root.get("nodes");
            if (arr != null && arr.isArray()) {
                for (com.fasterxml.jackson.databind.JsonNode n : arr) {
                    if (n == null) {
                        continue;
                    }
                    String name = n.hasNonNull("name") ? n.get("name").asText("") : "";
                    name = StringUtils.hasText(name) ? name.trim() : "";
                    if (!StringUtils.hasText(name)) {
                        continue;
                    }
                    if (!nodes.contains(name)) {
                        nodes.add(name);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to parse progress template nodes: styleNo={}, templateId={}",
                    StringUtils.hasText(styleNo) ? styleNo.trim() : null,
                    tpl.getId(),
                    e);
        }

        if (StringUtils.hasText(sn)) {
            List<String> fromProcess = resolveNodesFromStyleProcessTemplate(sn);
            if (!fromProcess.isEmpty()) {
                if (nodes.isEmpty() || !isStyleSpecific) {
                    return fromProcess;
                }
                List<String> merged = new ArrayList<>();
                for (String nodeName : nodes) {
                    String canonical = null;
                    for (String pn : fromProcess) {
                        if (stageNameHelper.progressStageNameMatches(nodeName, pn)) {
                            canonical = pn;
                            break;
                        }
                    }
                    String finalName = (canonical != null) ? canonical : nodeName;
                    if (!merged.contains(finalName)) {
                        merged.add(finalName);
                    }
                }
                for (String pn : fromProcess) {
                    boolean found = merged.stream().anyMatch(m -> stageNameHelper.progressStageNameMatches(m, pn));
                    if (!found) {
                        merged.add(pn);
                    }
                }
                return merged;
            }
        }

        return nodes;
    }

    public List<String> resolveNodesFromStyleProcessTemplate(String styleNo) {
        List<String> result = new ArrayList<>();
        if (!StringUtils.hasText(styleNo)) {
            return result;
        }
        try {
            TemplateLibrary tpl = templateLibraryMapper.selectOne(new LambdaQueryWrapper<TemplateLibrary>()
                    .eq(TemplateLibrary::getTemplateType, "process")
                    .eq(TemplateLibrary::getSourceStyleNo, styleNo.trim())
                    .orderByDesc(TemplateLibrary::getUpdateTime)
                    .last("limit 1"));
            if (tpl == null || !StringUtils.hasText(tpl.getTemplateContent())) {
                return result;
            }
            com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(tpl.getTemplateContent());
            com.fasterxml.jackson.databind.JsonNode steps = root.get("steps");
            if (steps == null || !steps.isArray()) {
                return result;
            }
            for (com.fasterxml.jackson.databind.JsonNode step : steps) {
                if (step == null) continue;
                String processName = step.hasNonNull("processName") ? step.get("processName").asText("").trim() : "";
                String progressStage = step.hasNonNull("progressStage") ? step.get("progressStage").asText("").trim() : processName;
                if (!StringUtils.hasText(processName)) continue;
                if ("入库".equals(progressStage)) {
                    continue;
                }
                if (!result.contains(processName)) {
                    result.add(processName);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to resolve progress nodes from process template: styleNo={}", styleNo, e);
        }
        return result;
    }

    public BigDecimal resolveTotalUnitPriceFromProgressTemplate(String styleNo) {
        List<Map<String, Object>> nodes = resolveProgressNodeUnitPrices(styleNo);
        if (nodes == null || nodes.isEmpty()) {
            return BigDecimal.ZERO;
        }

        BigDecimal sum = BigDecimal.ZERO;
        for (Map<String, Object> n : nodes) {
            if (n == null) {
                continue;
            }
            BigDecimal up = TemplateParseUtils.toBigDecimalOrZero(n.get("unitPrice"));
            if (up != null && up.compareTo(BigDecimal.ZERO) > 0) {
                sum = sum.add(up);
            }
        }

        if (sum.compareTo(BigDecimal.ZERO) > 0) {
            return sum.setScale(2, RoundingMode.HALF_UP);
        }
        return BigDecimal.ZERO;
    }

    public List<Map<String, Object>> resolveProgressNodeUnitPrices(String styleNo) {
        String cacheKey = UserContext.tenantId() + ":progressNodes:" + (styleNo != null ? styleNo.trim() : "");
        List<Map<String, Object>> cached = progressNodeUnitPriceCache.getIfPresent(cacheKey);
        if (cached != null) {
            return cached;
        }
        List<Map<String, Object>> result = doResolveProgressNodeUnitPrices(styleNo);
        if (!result.isEmpty()) {
            progressNodeUnitPriceCache.put(cacheKey, result);
        }
        return result;
    }

    private List<Map<String, Object>> doResolveProgressNodeUnitPrices(String styleNo) {
        List<Map<String, Object>> out = new ArrayList<>();
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : "";
        if (!StringUtils.hasText(sn)) {
            return out;
        }
        Map<String, BigDecimal> processPriceOverrides = resolveProcessUnitPrices(sn);

        List<Map<String, Object>> fromProcess = resolveFromProcessTemplate(sn, processPriceOverrides);
        if (!fromProcess.isEmpty()) {
            sortByStageOrder(fromProcess);
            log.info("resolveProgressNodeUnitPrices from process template: styleNo={}, count={}", sn, fromProcess.size());
            return fromProcess;
        }

        List<Map<String, Object>> processPriceNodes = resolveProgressNodeUnitPricesFromProcessPriceTemplate(sn);
        if (!processPriceNodes.isEmpty()) {
            sortByStageOrder(processPriceNodes);
            log.info("resolveProgressNodeUnitPrices from process_price template: styleNo={}, count={}", sn, processPriceNodes.size());
            return processPriceNodes;
        }

        List<Map<String, Object>> fromProgress = resolveFromProgressTemplate(sn);
        return fromProgress;
    }

    private List<Map<String, Object>> resolveFromProcessTemplate(String sn, Map<String, BigDecimal> processPriceOverrides) {
        List<Map<String, Object>> out = new ArrayList<>();
        try {
            TemplateLibrary processTpl = templateLibraryMapper.selectOne(new LambdaQueryWrapper<TemplateLibrary>()
                    .eq(TemplateLibrary::getTemplateType, "process")
                    .eq(TemplateLibrary::getSourceStyleNo, sn)
                    .orderByDesc(TemplateLibrary::getUpdateTime)
                    .orderByDesc(TemplateLibrary::getCreateTime)
                    .last("LIMIT 1"));
            if (processTpl == null || !StringUtils.hasText(processTpl.getTemplateContent())) {
                return out;
            }
            com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(processTpl.getTemplateContent());
            com.fasterxml.jackson.databind.JsonNode stepsArr = root.get("steps");
            if (stepsArr == null || !stepsArr.isArray()) {
                return out;
            }
            for (com.fasterxml.jackson.databind.JsonNode step : stepsArr) {
                if (step == null) {
                    continue;
                }
                Map<String, Object> item = parseProcessStep(step, processPriceOverrides);
                if (item != null) {
                    out.add(item);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to resolve from process template: styleNo={}", sn, e);
        }
        return out;
    }

    private Map<String, Object> parseProcessStep(com.fasterxml.jackson.databind.JsonNode step, Map<String, BigDecimal> processPriceOverrides) {
        String processName = step.hasNonNull("processName") ? step.get("processName").asText("") : "";
        processName = StringUtils.hasText(processName) ? processName.trim() : "";
        if (!StringUtils.hasText(processName)) {
            return null;
        }
        String processCode = step.hasNonNull("processCode") ? step.get("processCode").asText("") : "";
        if (!StringUtils.hasText(processCode)) {
            processCode = processName;
        }
        BigDecimal up = parseJsonNodeDecimal(step, "unitPrice");
        if (up == null) {
            up = parseJsonNodeDecimal(step, "price");
        }
        if (up == null || up.compareTo(BigDecimal.ZERO) < 0) {
            up = BigDecimal.ZERO;
        }
        String progressStage = step.hasNonNull("progressStage") ? step.get("progressStage").asText("") : "";
        if (!StringUtils.hasText(progressStage) || progressStage.trim().equals(processName)) {
            progressStage = resolveProgressStageFromMapping(processName);
        }
        String machineType = step.hasNonNull("machineType") ? step.get("machineType").asText("") : "";
        String description = step.hasNonNull("description")
                ? step.get("description").asText("")
                : (step.hasNonNull("remark") ? step.get("remark").asText("") : "");
        Integer standardTime = null;
        if (step.hasNonNull("standardTime")) {
            standardTime = step.get("standardTime").asInt(0);
        }

        Map<String, Object> item = new LinkedHashMap<>();
        BigDecimal finalPrice = matchProcessUnitPrice(processPriceOverrides, processName);
        if (finalPrice == null) {
            finalPrice = up;
        }
        item.put("id", processCode.trim());
        item.put("name", processName);
        item.put("unitPrice", finalPrice.setScale(2, RoundingMode.HALF_UP));
        item.put("progressStage", progressStage.trim());
        if (StringUtils.hasText(machineType)) {
            item.put("machineType", machineType);
        }
        if (StringUtils.hasText(description)) {
            item.put("description", description.trim());
        }
        if (standardTime != null && standardTime > 0) {
            item.put("standardTime", standardTime);
        }
        return item;
    }

    private BigDecimal parseJsonNodeDecimal(com.fasterxml.jackson.databind.JsonNode parent, String fieldName) {
        if (!parent.hasNonNull(fieldName)) {
            return null;
        }
        com.fasterxml.jackson.databind.JsonNode v = parent.get(fieldName);
        if (v.isNumber()) {
            return v.decimalValue();
        }
        return parseDecimalText(v.asText(null));
    }

    private List<Map<String, Object>> resolveFromProgressTemplate(String sn) {
        List<Map<String, Object>> out = new ArrayList<>();
        TemplateLibrary tpl = resolveProgressTemplate(sn);
        if (tpl == null || !StringUtils.hasText(tpl.getTemplateContent())) {
            return out;
        }
        try {
            com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(tpl.getTemplateContent());
            com.fasterxml.jackson.databind.JsonNode arr = root.get("nodes");
            if (arr == null || !arr.isArray()) {
                return out;
            }
            for (com.fasterxml.jackson.databind.JsonNode n : arr) {
                if (n == null) {
                    continue;
                }
                Map<String, Object> item = parseProgressNode(n);
                if (item != null) {
                    out.add(item);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to resolve progress node unit prices from template: styleNo={}, templateId={}",
                    sn, tpl.getId(), e);
        }
        return out;
    }

    private Map<String, Object> parseProgressNode(com.fasterxml.jackson.databind.JsonNode n) {
        String name = n.hasNonNull("name") ? n.get("name").asText("") : "";
        name = StringUtils.hasText(name) ? name.trim() : "";
        if (!StringUtils.hasText(name)) {
            return null;
        }
        String id = n.hasNonNull("id") ? n.get("id").asText("") : "";
        id = StringUtils.hasText(id) ? id.trim() : name;
        BigDecimal up = parseJsonNodeDecimal(n, "unitPrice");
        if (up == null || up.compareTo(BigDecimal.ZERO) < 0) {
            up = BigDecimal.ZERO;
        }
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", id);
        item.put("name", name);
        item.put("unitPrice", up.setScale(2, RoundingMode.HALF_UP));
        String progressStage = n.hasNonNull("progressStage") ? n.get("progressStage").asText("") : "";
        if (!StringUtils.hasText(progressStage) || progressStage.trim().equals(name)) {
            progressStage = resolveProgressStageFromMapping(name);
        }
        if (StringUtils.hasText(progressStage)) {
            item.put("progressStage", progressStage.trim());
        }
        String description = n.hasNonNull("description")
                ? n.get("description").asText("")
                : (n.hasNonNull("remark") ? n.get("remark").asText("") : "");
        if (StringUtils.hasText(description)) {
            item.put("description", description.trim());
        }
        return item;
    }

    private List<Map<String, Object>> resolveProgressNodeUnitPricesFromProcessPriceTemplate(String styleNo) {
        List<Map<String, Object>> out = new ArrayList<>();
        TemplateLibrary tpl = resolveProcessPriceTemplate(styleNo);
        if (tpl == null || !StringUtils.hasText(tpl.getTemplateContent())) {
            return out;
        }

        Map<String, Object> content = parseContentMap(tpl.getTemplateContent());
        List<Map<String, Object>> items = TemplateParseUtils.coerceListOfMap(content.get("steps"));
        if (items == null || items.isEmpty()) {
            items = TemplateParseUtils.coerceListOfMap(content.get("nodes"));
        }

        for (Map<String, Object> item : items) {
            if (item == null) {
                continue;
            }

            String processName = String.valueOf(item.getOrDefault("processName", item.getOrDefault("name", ""))).trim();
            if (!StringUtils.hasText(processName)) {
                continue;
            }

            String processCode = String.valueOf(item.getOrDefault("processCode", item.getOrDefault("id", ""))).trim();
            if (!StringUtils.hasText(processCode)) {
                processCode = processName;
            }

            Object priceValue = item.containsKey("unitPrice") ? item.get("unitPrice") : item.get("price");
            BigDecimal unitPrice = TemplateParseUtils.toBigDecimalOrZero(priceValue);
            if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) < 0) {
                unitPrice = BigDecimal.ZERO;
            }

            String progressStage = String.valueOf(item.getOrDefault("progressStage", "")).trim();
            if (!StringUtils.hasText(progressStage) || progressStage.equals(processName)) {
                progressStage = resolveProgressStageFromMapping(processName);
            }

            Map<String, Object> node = new LinkedHashMap<>();
            node.put("id", processCode);
            node.put("name", processName);
            node.put("unitPrice", unitPrice.setScale(2, RoundingMode.HALF_UP));
            node.put("progressStage", progressStage);
            String description = String.valueOf(item.getOrDefault("description", item.getOrDefault("remark", ""))).trim();
            if (StringUtils.hasText(description)) {
                node.put("description", description);
            }

            String machineType = String.valueOf(item.getOrDefault("machineType", "")).trim();
            if (StringUtils.hasText(machineType)) {
                node.put("machineType", machineType);
            }

            Object standardTimeValue = item.get("standardTime");
            if (standardTimeValue instanceof Number number && number.intValue() > 0) {
                node.put("standardTime", number.intValue());
            } else if (standardTimeValue != null) {
                try {
                    int standardTime = Integer.parseInt(String.valueOf(standardTimeValue).trim());
                    if (standardTime > 0) {
                        node.put("standardTime", standardTime);
                    }
                } catch (Exception e) {
                    log.debug("[Template] standardTime解析失败: {}", e.getMessage());
                }
            }

            out.add(node);
        }

        return sortByStageOrder(out);
    }

    private List<Map<String, Object>> sortByStageOrder(List<Map<String, Object>> nodes) {
        if (nodes == null || nodes.size() <= 1) return nodes;
        nodes.sort((a, b) -> {
            String stageA = String.valueOf(a.getOrDefault("progressStage", "")).trim();
            String stageB = String.valueOf(b.getOrDefault("progressStage", "")).trim();
            int idxA = STAGE_ORDER.indexOf(stageA);
            int idxB = STAGE_ORDER.indexOf(stageB);
            if (idxA == -1) idxA = 999;
            if (idxB == -1) idxB = 999;
            if (idxA != idxB) return idxA - idxB;
            String idA = String.valueOf(a.getOrDefault("id", "")).trim();
            String idB = String.valueOf(b.getOrDefault("id", "")).trim();
            int cmp = compareProcessCodes(idA, idB);
            if (cmp != 0) return cmp;
            return idA.compareTo(idB);
        });
        return nodes;
    }

    private static boolean isProcessCode(String id) {
        if (id == null || id.isEmpty()) return false;
        if (id.matches("^[0-9a-f]{8}-.*")) return false;
        return id.matches("^[\\d]+(-[\\d]+)*$");
    }

    private static int compareProcessCodes(String idA, String idB) {
        boolean isA = isProcessCode(idA);
        boolean isB = isProcessCode(idB);
        if (isA && !isB) return -1;
        if (!isA && isB) return 1;
        if (!isA && !isB) return 0;
        String[] segsA = idA.split("-");
        String[] segsB = idB.split("-");
        int maxLen = Math.max(segsA.length, segsB.length);
        for (int i = 0; i < maxLen; i++) {
            int numA = i < segsA.length ? parseSortNumber(segsA[i]) : -1;
            int numB = i < segsB.length ? parseSortNumber(segsB[i]) : -1;
            if (numA != numB) return numA - numB;
        }
        return 0;
    }

    private static int parseSortNumber(String id) {
        if (id == null || id.isEmpty()) return 9999;
        String digits = id.replaceAll("\\D", "");
        if (digits.isEmpty()) return 9999;
        try { return Integer.parseInt(digits); } catch (NumberFormatException e) { return 9999; }
    }

    private BigDecimal matchProcessUnitPrice(Map<String, BigDecimal> processPrices, String name) {
        if (processPrices == null || processPrices.isEmpty() || !StringUtils.hasText(name)) {
            return null;
        }
        String n = name.trim();
        if (!StringUtils.hasText(n)) {
            return null;
        }

        BigDecimal exact = processPrices.get(n);
        if (exact != null && exact.compareTo(BigDecimal.ZERO) > 0) {
            return exact;
        }

        for (Map.Entry<String, BigDecimal> e : processPrices.entrySet()) {
            if (e == null) {
                continue;
            }
            String k = e.getKey();
            if (!StringUtils.hasText(k)) {
                continue;
            }
            if (stageNameHelper.progressStageNameMatches(k, n)) {
                BigDecimal v = e.getValue();
                return v == null ? null : v;
            }
        }

        return null;
    }

    private BigDecimal parseDecimalText(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        String s = raw.trim();
        if (s.isEmpty() || !DECIMAL_PATTERN.matcher(s).matches()) {
            return null;
        }
        return new BigDecimal(s);
    }

    private int clampPercent(int progressPercent) {
        if (progressPercent < 0) {
            return 0;
        }
        if (progressPercent > 100) {
            return 100;
        }
        return progressPercent;
    }

    public int resolveProgressNodeIndexFromPercent(int nodeCount, int progressPercent) {
        if (nodeCount <= 1) {
            return 0;
        }
        int p = clampPercent(progressPercent);
        int idx = (int) Math.round((p / 100.0) * (nodeCount - 1));
        if (idx < 0) {
            return 0;
        }
        if (idx > nodeCount - 1) {
            return nodeCount - 1;
        }
        return idx;
    }

    public String resolveProgressNodeNameFromPercent(String styleNo, int progressPercent) {
        List<String> nodes = resolveProgressNodes(styleNo);
        if (nodes.isEmpty()) {
            return null;
        }
        int idx = resolveProgressNodeIndexFromPercent(nodes.size(), progressPercent);
        String name = nodes.get(Math.max(0, Math.min(nodes.size() - 1, idx)));
        return StringUtils.hasText(name) ? name.trim() : null;
    }

    public void loadProgressWeights(String styleNo, Map<String, BigDecimal> weights, List<String> processOrder) {
        if (weights == null || processOrder == null) {
            return;
        }

        weights.clear();
        processOrder.clear();
        processOrder.add(TemplateStageNameHelper.STAGE_ORDER_CREATED);
        processOrder.add(TemplateStageNameHelper.STAGE_PROCUREMENT);

        weights.put(TemplateStageNameHelper.STAGE_ORDER_CREATED, new BigDecimal("5"));
        weights.put(TemplateStageNameHelper.STAGE_PROCUREMENT, new BigDecimal("15"));

        List<String> nodes = resolveProgressNodes(styleNo);

        boolean hasCutting = false;
        for (String n : nodes) {
            if (stageNameHelper.isProgressCuttingStageName(n)) {
                hasCutting = true;
                break;
            }
        }
        if (!hasCutting) {
            processOrder.add("裁剪");
        }

        for (String n : nodes) {
            String name = StringUtils.hasText(n) ? n.trim() : null;
            if (!StringUtils.hasText(name)) {
                continue;
            }
            boolean exists = false;
            for (String existed : processOrder) {
                if (stageNameHelper.progressStageNameMatches(existed, name)) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                processOrder.add(name);
            }
        }

        int productionCount = 0;
        for (String n : processOrder) {
            if (!StringUtils.hasText(n)) {
                continue;
            }
            String pn = n.trim();
            if (!stageNameHelper.isBaseStageName(pn)) {
                productionCount += 1;
            }
        }

        if (productionCount > 0) {
            BigDecimal per = new BigDecimal("80")
                    .divide(BigDecimal.valueOf(productionCount), 6, RoundingMode.HALF_UP);
            for (String n : processOrder) {
                if (!StringUtils.hasText(n)) {
                    continue;
                }
                String pn = n.trim();
                if (stageNameHelper.isBaseStageName(pn)) {
                    continue;
                }
                weights.putIfAbsent(pn, per);
            }
        }
    }

    public void invalidateTemplateCache(String templateType, String sourceStyleNo) {
        try {
            if ("progress".equals(templateType)) {
                if (StringUtils.hasText(sourceStyleNo)) {
                    progressTemplateCache.invalidate(buildTemplateCacheKey(sourceStyleNo));
                }
                progressTemplateCache.invalidate(buildTemplateCacheKey(null));
            } else if ("process_price".equals(templateType)) {
                if (StringUtils.hasText(sourceStyleNo)) {
                    processPriceTemplateCache.invalidate(buildTemplateCacheKey(sourceStyleNo));
                }
                processPriceTemplateCache.invalidate(buildTemplateCacheKey(null));
            }
            progressNodeUnitPriceCache.invalidateAll();
        } catch (Exception e) {
            log.warn("invalidateTemplateCache failed: type={}, styleNo={}", templateType, sourceStyleNo);
        }
    }

    public Map<String, BigDecimal> parseProcessUnitPrices(String processJson) {
        Map<String, BigDecimal> result = new LinkedHashMap<>();
        if (!StringUtils.hasText(processJson)) {
            return result;
        }

        try {
            Map<String, Object> content = objectMapper.readValue(processJson, new TypeReference<Map<String, Object>>() {});
            List<Map<String, Object>> steps = TemplateParseUtils.coerceListOfMap(content.get("steps"));

            for (Map<String, Object> step : steps) {
                if (step == null) continue;

                String processName = String.valueOf(step.getOrDefault("processName", "")).trim();
                if (!StringUtils.hasText(processName)) {
                    processName = String.valueOf(step.getOrDefault("name", "")).trim();
                }
                if (!StringUtils.hasText(processName)) continue;

                Object priceObj = step.containsKey("unitPrice") ? step.get("unitPrice") : step.get("price");
                BigDecimal price = TemplateParseUtils.toBigDecimalOrZero(priceObj);
                result.put(processName, price);
            }
        } catch (Exception e) {
            log.warn("Failed to parse process unit prices from JSON", e);
        }

        return result;
    }

    public Map<String, BigDecimal> resolveProcessUnitPrices(String styleNo) {
        TemplateLibrary tpl = resolveProcessPriceTemplate(styleNo);
        if (tpl == null || !StringUtils.hasText(tpl.getTemplateContent())) {
            return new LinkedHashMap<>();
        }
        Map<String, Object> content = parseContentMap(tpl.getTemplateContent());

        List<Map<String, Object>> items = TemplateParseUtils.coerceListOfMap(content.get("steps"));
        if (items == null || items.isEmpty()) {
            items = TemplateParseUtils.coerceListOfMap(content.get("nodes"));
        }

        LinkedHashMap<String, BigDecimal> out = new LinkedHashMap<>();
        for (Map<String, Object> s : items) {
            if (s == null) {
                continue;
            }
            String name = String.valueOf(s.getOrDefault("processName", "")).trim();
            if (!StringUtils.hasText(name)) {
                name = String.valueOf(s.getOrDefault("name", "")).trim();
            }
            if (!StringUtils.hasText(name)) {
                continue;
            }
            Object v = s.containsKey("unitPrice") ? s.get("unitPrice") : s.get("price");
            BigDecimal p = TemplateParseUtils.toBigDecimalOrZero(v);
            out.put(name, p);
        }
        return out;
    }

    private Map<String, Object> parseContentMap(String json) {

        String raw = String.valueOf(json == null ? "" : json).trim();
        if (!StringUtils.hasText(raw)) {
            return new HashMap<>();
        }
        try {
            Map<String, Object> map = objectMapper.readValue(raw, new TypeReference<Map<String, Object>>() {
            });
            return map == null ? new HashMap<>() : map;
        } catch (Exception e) {
            return new HashMap<>();
        }
    }

    private String resolveProgressStageFromMapping(String processName) {
        if (!StringUtils.hasText(processName)) {
            return processName;
        }
        String normalized = ProcessSynonymMapping.normalize(processName.trim());
        if (STAGE_ORDER.contains(normalized)) {
            return normalized;
        }
        String mapped = processParentMappingService.resolveParentNode(processName.trim());
        if (StringUtils.hasText(mapped)) {
            String normalizedMapped = ProcessSynonymMapping.normalize(mapped.trim());
            if (STAGE_ORDER.contains(normalizedMapped)) {
                return normalizedMapped;
            }
            if (StringUtils.hasText(mapped)) {
                return mapped;
            }
        }
        return processName;
    }
}
