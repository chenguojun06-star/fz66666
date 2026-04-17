package com.fashion.supplychain.template.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.mapper.TemplateLibraryMapper;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import com.fashion.supplychain.template.helper.TemplateStageNameHelper;
import com.fashion.supplychain.template.helper.TemplateParseUtils;

@Service
@Slf4j
public class TemplateLibraryServiceImpl extends ServiceImpl<TemplateLibraryMapper, TemplateLibrary>
        implements TemplateLibraryService {

    private static final Pattern DECIMAL_PATTERN = Pattern.compile("[+-]?\\d+(\\.\\d+)?");

    /** 进度模板本地缓存：styleNo → TemplateLibrary，10分钟过期，最多200条 */
    private final Cache<String, TemplateLibrary> progressTemplateCache = Caffeine.newBuilder()
            .expireAfterWrite(10, TimeUnit.MINUTES)
            .maximumSize(200)
            .build();

    /** 工价模板本地缓存：styleNo → TemplateLibrary，10分钟过期，最多200条 */
    private final Cache<String, TemplateLibrary> processPriceTemplateCache = Caffeine.newBuilder()
            .expireAfterWrite(10, TimeUnit.MINUTES)
            .maximumSize(200)
            .build();

    /** 工序节点单价列表缓存（替代 Redis @Cacheable，避免 List<Map> 泛型在 DefaultTyping 序列化模式下反序列化失败），5分钟过期，最多500条 */
    private final Cache<String, List<Map<String, Object>>> progressNodeUnitPriceCache = Caffeine.newBuilder()
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .maximumSize(500)
            .build();


    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private TemplateStageNameHelper stageNameHelper;


    private String buildTemplateCacheKey(String styleNo) {
        Long tenantId = UserContext.tenantId();
        String tenantPart = tenantId == null ? "superadmin" : "t" + tenantId;
        String stylePart = StringUtils.hasText(styleNo) ? styleNo.trim() : "__default__";
        return tenantPart + ":" + stylePart;
    }

    @Override
    public boolean isProgressIroningStageName(String name) {
        return stageNameHelper.isProgressIroningStageName(name);
    }

    @Override
    public boolean isProgressQualityStageName(String name) {
        return stageNameHelper.isProgressQualityStageName(name);
    }

    @Override
    public boolean isProgressPackagingStageName(String name) {
        return stageNameHelper.isProgressPackagingStageName(name);
    }

    @Override
    public boolean progressStageNameMatches(String stageName, String recordProcessName) {
        return stageNameHelper.progressStageNameMatches(stageName, recordProcessName);
    }

    private TemplateLibrary resolveProgressTemplate(String styleNo) {
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        String cacheKey = buildTemplateCacheKey(sn);
        TemplateLibrary cached = progressTemplateCache.getIfPresent(cacheKey);
        if (cached != null) {
            return cached;
        }
        TemplateLibrary tpl = null;
        try {
            if (StringUtils.hasText(sn)) {
                tpl = getOne(new LambdaQueryWrapper<TemplateLibrary>()
                        .eq(TemplateLibrary::getTemplateType, "progress")
                        .eq(TemplateLibrary::getSourceStyleNo, sn)
                        .orderByDesc(TemplateLibrary::getUpdateTime)
                        .orderByDesc(TemplateLibrary::getCreateTime)
                        .last("limit 1"));
            }

            if (tpl == null) {
                tpl = getOne(new LambdaQueryWrapper<TemplateLibrary>()
                        .eq(TemplateLibrary::getTemplateType, "progress")
                        .eq(TemplateLibrary::getTemplateKey, "default")
                        .orderByDesc(TemplateLibrary::getUpdateTime)
                        .orderByDesc(TemplateLibrary::getCreateTime)
                        .last("limit 1"));
            }

            if (tpl == null) {
                tpl = getOne(new LambdaQueryWrapper<TemplateLibrary>()
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

    private TemplateLibrary resolveProcessPriceTemplate(String styleNo) {
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
            tpl = getOne(new LambdaQueryWrapper<TemplateLibrary>()
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

    @Override
    public List<String> resolveProgressNodes(String styleNo) {
        TemplateLibrary tpl = resolveProgressTemplate(styleNo);
        if (tpl == null || !StringUtils.hasText(tpl.getTemplateContent())) {
            return new ArrayList<>();
        }

        // 判断是否命中款式专属 progress 模板（而非系统默认模板）
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

        // 无论是否命中款式专属 progress 模板，都尝试从 process 类型模板同步最新工序名称。
        // 原因：process 类型模板是用户直接维护的"工序表"（如"工序表"页面），名称最新；
        //       progress 类型模板可能是创建订单时快照的旧名称（如"整烫"→已改为"大烫"）。
        // 策略：以 process 模板节点为权威名称，用同义词匹配将 progress 模板节点替换为最新名称，
        //       并追加 progress 模板中不存在的 process 模板节点。
        if (StringUtils.hasText(sn)) {
            List<String> fromProcess = resolveNodesFromStyleProcessTemplate(sn);
            if (!fromProcess.isEmpty()) {
                if (nodes.isEmpty() || !isStyleSpecific) {
                    // 直接使用 process 模板作为顺序和名称（默认/非专属 progress 模板情况）
                    return fromProcess;
                }
                // style-specific progress 模板存在：用 process 模板名称替换同义词名称，保持 progress 模板顺序
                List<String> merged = new ArrayList<>();
                for (String nodeName : nodes) {
                    String canonical = null;
                    for (String pn : fromProcess) {
                        if (progressStageNameMatches(nodeName, pn)) {
                            canonical = pn; // 用 process 模板的最新名称替换
                            break;
                        }
                    }
                    String finalName = (canonical != null) ? canonical : nodeName;
                    if (!merged.contains(finalName)) {
                        merged.add(finalName);
                    }
                }
                // 追加 process 模板中有但 progress 模板中没有的节点
                for (String pn : fromProcess) {
                    boolean found = merged.stream().anyMatch(m -> progressStageNameMatches(m, pn));
                    if (!found) {
                        merged.add(pn);
                    }
                }
                return merged;
            }
        }

        return nodes;
    }

    /**
     * 从款式 process 类型模板的 steps[].processName 读取工序名列表，
     * 排除入库/二次工艺进度阶段（由专属逻辑处理）。
     */
    private List<String> resolveNodesFromStyleProcessTemplate(String styleNo) {
        List<String> result = new ArrayList<>();
        if (!StringUtils.hasText(styleNo)) {
            return result;
        }
        try {
            TemplateLibrary tpl = getOne(new LambdaQueryWrapper<TemplateLibrary>()
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
                // 排除入库（由质检入库模块处理）
                if ("入库".equals(progressStage)) {
                    continue;
                }
                // ★ 二次工艺子工序：加入节点列表并保留 progressStage="二次工艺"
                // 旧逻辑排除了所有二次工艺子工序，导致前端进度球无法显示二次工艺父节点
                // 现在保留它们，前端通过 progressStage="二次工艺" 正确聚合到父进度球
                if (!result.contains(processName)) {
                    result.add(processName);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to resolve progress nodes from process template: styleNo={}", styleNo, e);
        }
        return result;
    }

    @Override
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

    @Override
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

        // 优先从模板库的 process 类型模板（单价维护-工序进度单价）读取
        try {
            TemplateLibrary processTpl = getOne(new LambdaQueryWrapper<TemplateLibrary>()
                    .eq(TemplateLibrary::getTemplateType, "process")
                    .eq(TemplateLibrary::getSourceStyleNo, sn)
                    .orderByDesc(TemplateLibrary::getUpdateTime)
                    .orderByDesc(TemplateLibrary::getCreateTime)
                    .last("LIMIT 1"));

            if (processTpl != null && StringUtils.hasText(processTpl.getTemplateContent())) {
                com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(processTpl.getTemplateContent());
                com.fasterxml.jackson.databind.JsonNode stepsArr = root.get("steps");

                if (stepsArr != null && stepsArr.isArray()) {
                    for (com.fasterxml.jackson.databind.JsonNode step : stepsArr) {
                        if (step == null) {
                            continue;
                        }

                        String processName = step.hasNonNull("processName") ? step.get("processName").asText("") : "";
                        processName = StringUtils.hasText(processName) ? processName.trim() : "";
                        if (!StringUtils.hasText(processName)) {
                            continue;
                        }

                        String processCode = step.hasNonNull("processCode") ? step.get("processCode").asText("") : "";
                        if (!StringUtils.hasText(processCode)) {
                            processCode = processName;
                        }

                        // 读取工价（unitPrice 或 price）
                        BigDecimal up = BigDecimal.ZERO;
                        if (step.hasNonNull("unitPrice")) {
                            com.fasterxml.jackson.databind.JsonNode v = step.get("unitPrice");
                            if (v.isNumber()) {
                                up = v.decimalValue();
                            } else {
                                BigDecimal parsed = parseDecimalText(v.asText(null));
                                up = parsed != null ? parsed : BigDecimal.ZERO;
                            }
                        } else if (step.hasNonNull("price")) {
                            com.fasterxml.jackson.databind.JsonNode v = step.get("price");
                            if (v.isNumber()) {
                                up = v.decimalValue();
                            } else {
                                BigDecimal parsed = parseDecimalText(v.asText(null));
                                up = parsed != null ? parsed : BigDecimal.ZERO;
                            }
                        }
                        if (up.compareTo(BigDecimal.ZERO) < 0) {
                            up = BigDecimal.ZERO;
                        }

                        // 读取进度节点
                        String progressStage = step.hasNonNull("progressStage") ? step.get("progressStage").asText("") : "";
                        if (!StringUtils.hasText(progressStage)) {
                            progressStage = processName;
                        }

                        // 读取机器类型
                        String machineType = step.hasNonNull("machineType") ? step.get("machineType").asText("") : "";
                        String description = step.hasNonNull("description")
                                ? step.get("description").asText("")
                                : (step.hasNonNull("remark") ? step.get("remark").asText("") : "");

                        // 读取标准工时
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
                        out.add(item);
                    }

                    if (!out.isEmpty()) {
                        sortByStageOrder(out);
                        log.info("resolveProgressNodeUnitPrices from process template: styleNo={}, count={}", sn, out.size());
                        return out;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to resolve from process template: styleNo={}", sn, e);
        }

        List<Map<String, Object>> processPriceNodes = resolveProgressNodeUnitPricesFromProcessPriceTemplate(sn);
        if (!processPriceNodes.isEmpty()) {
            sortByStageOrder(processPriceNodes);
            log.info("resolveProgressNodeUnitPrices from process_price template: styleNo={}, count={}", sn, processPriceNodes.size());
            return processPriceNodes;
        }

        // 如果没有 process 模板，回退到旧的 progress 模板
        TemplateLibrary tpl = resolveProgressTemplate(styleNo);

        // 如果没有进度模板，返回空列表
        if (tpl == null || !StringUtils.hasText(tpl.getTemplateContent())) {
            return out;
        }

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

                    String id = n.hasNonNull("id") ? n.get("id").asText("") : "";
                    id = StringUtils.hasText(id) ? id.trim() : name;

                    BigDecimal up = BigDecimal.ZERO;
                    if (n.hasNonNull("unitPrice")) {
                        com.fasterxml.jackson.databind.JsonNode v = n.get("unitPrice");
                        if (v != null) {
                            if (v.isNumber()) {
                                up = v.decimalValue();
                            } else {
                                BigDecimal parsed = parseDecimalText(v.asText(null));
                                up = parsed == null ? BigDecimal.ZERO : parsed;
                            }
                        }
                    }
                    if (up == null || up.compareTo(BigDecimal.ZERO) < 0) {
                        up = BigDecimal.ZERO;
                    }

                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", id);
                    item.put("name", name);
                    item.put("unitPrice", up.setScale(2, RoundingMode.HALF_UP));
                    String description = n.hasNonNull("description")
                            ? n.get("description").asText("")
                            : (n.hasNonNull("remark") ? n.get("remark").asText("") : "");
                    if (StringUtils.hasText(description)) {
                        item.put("description", description.trim());
                    }
                    out.add(item);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to resolve progress node unit prices from template: styleNo={}, templateId={}",
                    sn,
                    tpl.getId(),
                    e);
        }

        return out;
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
            if (!StringUtils.hasText(progressStage)) {
                progressStage = processName;
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
                } catch (Exception ignore) {
                    // ignore invalid value
                }
            }

            out.add(node);
        }

        return sortByStageOrder(out);
    }

    private static final List<String> STAGE_ORDER = List.of("采购", "裁剪", "二次工艺", "车缝", "尾部", "入库");

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
            int numA = parseSortNumber(idA);
            int numB = parseSortNumber(idB);
            if (numA != numB) return numA - numB;
            return idA.compareTo(idB);
        });
        return nodes;
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
            if (progressStageNameMatches(k, n)) {
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

    @Override
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

    @Override
    public String resolveProgressNodeNameFromPercent(String styleNo, int progressPercent) {
        List<String> nodes = resolveProgressNodes(styleNo);
        if (nodes.isEmpty()) {
            return null;
        }
        int idx = resolveProgressNodeIndexFromPercent(nodes.size(), progressPercent);
        String name = nodes.get(Math.max(0, Math.min(nodes.size() - 1, idx)));
        return StringUtils.hasText(name) ? name.trim() : null;
    }

    @Override
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

        // 确保裁剪环节存在（如果模板中未定义，则默认插入到采购之后）
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
                if (progressStageNameMatches(existed, name)) {
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

    @Override
    public IPage<TemplateLibrary> queryPage(Map<String, Object> params) {
        long page = ParamUtils.getPageLong(params);
        long pageSize = ParamUtils.getPageSizeLong(params);

        Page<TemplateLibrary> pageInfo = new Page<>(page, pageSize);

        String templateType = String.valueOf(params.getOrDefault("templateType", "")).trim();
        String keyword = String.valueOf(params.getOrDefault("keyword", "")).trim();
        String sourceStyleNo = String.valueOf(params.getOrDefault("sourceStyleNo", "")).trim();

        LambdaQueryWrapper<TemplateLibrary> wrapper = new LambdaQueryWrapper<TemplateLibrary>()
                .like(StringUtils.hasText(keyword), TemplateLibrary::getTemplateName, keyword)
                .eq(StringUtils.hasText(sourceStyleNo), TemplateLibrary::getSourceStyleNo, sourceStyleNo)
                .orderByDesc(TemplateLibrary::getUpdateTime)
                .orderByDesc(TemplateLibrary::getCreateTime);

        // 外发工厂用户：仅允许查看分配给该工厂订单的款号模板
        @SuppressWarnings("unchecked")
        java.util.List<String> allowedStyleNos = (java.util.List<String>) params.get("allowedStyleNos");
        if (allowedStyleNos != null) {
            wrapper.in(TemplateLibrary::getSourceStyleNo, allowedStyleNos);
        }

        if (StringUtils.hasText(templateType)) {
            if ("process".equalsIgnoreCase(templateType)) {
                wrapper.and(q -> q.eq(TemplateLibrary::getTemplateType, "process")
                        .or()
                        .eq(TemplateLibrary::getTemplateType, "process_price"));
            } else {
                wrapper.eq(TemplateLibrary::getTemplateType, templateType);
            }
        }

        // 租户隔离：普通租户只看自己的+系统级(tenantId=null)，超管只看系统级模板
        Long currentTenantId = UserContext.tenantId();
        if (currentTenantId != null) {
            final Long tid = currentTenantId;
            wrapper.and(q -> q.eq(TemplateLibrary::getTenantId, tid).or().isNull(TemplateLibrary::getTenantId));
        } else {
            wrapper.isNull(TemplateLibrary::getTenantId);
        }

        return baseMapper.selectPage(pageInfo, wrapper);
    }

    @Override
    public List<TemplateLibrary> listByType(String templateType) {
        String t = String.valueOf(templateType == null ? "" : templateType).trim();
        if (!StringUtils.hasText(t)) {
            return List.of();
        }
        LambdaQueryWrapper<TemplateLibrary> wrapper = new LambdaQueryWrapper<TemplateLibrary>()
                .eq(TemplateLibrary::getTemplateType, t)
                .orderByAsc(TemplateLibrary::getTemplateName)
                .orderByAsc(TemplateLibrary::getTemplateKey);
        // 租户隔离：普通租户只看自己的+系统级(tenantId=null)，超管只看系统级模板
        Long currentTenantId = UserContext.tenantId();
        if (currentTenantId != null) {
            final Long tid = currentTenantId;
            wrapper.and(q -> q.eq(TemplateLibrary::getTenantId, tid).or().isNull(TemplateLibrary::getTenantId));
        } else {
            wrapper.isNull(TemplateLibrary::getTenantId);
        }
        return list(wrapper);
    }

    @Override
    public boolean upsertTemplate(TemplateLibrary template) {
        if (template == null || !StringUtils.hasText(template.getTemplateType())
                || !StringUtils.hasText(template.getTemplateKey())) {
            throw new IllegalArgumentException("模板参数不完整");
        }

        // 写操作时清除相关缓存
        invalidateTemplateCache(template.getTemplateType(), template.getSourceStyleNo());

        LocalDateTime now = LocalDateTime.now();

        TemplateLibrary existing = getOne(new LambdaQueryWrapper<TemplateLibrary>()
                .eq(TemplateLibrary::getTemplateType, template.getTemplateType())
                .eq(TemplateLibrary::getTemplateKey, template.getTemplateKey())
                .last("LIMIT 1"));

        if (existing != null) {
            // 更新现有模板
            existing.setTemplateName(template.getTemplateName());
            existing.setSourceStyleNo(template.getSourceStyleNo());
            existing.setTemplateContent(template.getTemplateContent());
            existing.setLocked(template.getLocked() != null ? template.getLocked() : 1);
            existing.setUpdateTime(now);
            return updateById(existing);
        } else {
            // 创建新模板
            if (!StringUtils.hasText(template.getId())) {
                template.setId(UUID.randomUUID().toString());
            }
            template.setLocked(template.getLocked() != null ? template.getLocked() : 1);
            template.setCreateTime(now);
            template.setUpdateTime(now);
            return save(template);
        }
    }

    /**
     * 模板写操作后清除相关缓存
     */
    private void invalidateTemplateCache(String templateType, String sourceStyleNo) {
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
            // progress/process_price/process 三种类型均影响 resolveProgressNodeUnitPrices，统一全量清除
            progressNodeUnitPriceCache.invalidateAll();
        } catch (Exception e) {
            log.warn("invalidateTemplateCache failed: type={}, styleNo={}", templateType, sourceStyleNo);
        }
    }

    @Override
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

    @Override
    public Map<String, BigDecimal> resolveProcessUnitPrices(String styleNo) {
        TemplateLibrary tpl = resolveProcessPriceTemplate(styleNo);
        if (tpl == null || !StringUtils.hasText(tpl.getTemplateContent())) {
            return new LinkedHashMap<>();
        }
        Map<String, Object> content = parseContentMap(tpl.getTemplateContent());

        // 兼容两种格式：steps（旧格式）和 nodes（新格式）
        List<Map<String, Object>> items = TemplateParseUtils.coerceListOfMap(content.get("steps"));
        if (items == null || items.isEmpty()) {
            items = TemplateParseUtils.coerceListOfMap(content.get("nodes"));
        }

        LinkedHashMap<String, BigDecimal> out = new LinkedHashMap<>();
        for (Map<String, Object> s : items) {
            if (s == null) {
                continue;
            }
            // 兼容两种字段名：processName（旧）和 name（新）
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

}
