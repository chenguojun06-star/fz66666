package com.fashion.supplychain.template.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
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
import com.fashion.supplychain.common.ProcessSynonymMapping;

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

    private static final String STAGE_ORDER_CREATED = "下单";
    private static final String STAGE_PROCUREMENT = "采购";

    @Autowired
    private ObjectMapper objectMapper;

    private String normalizeStageName(String v) {
        if (!StringUtils.hasText(v)) {
            return "";
        }
        return v.trim().replaceAll("\\s+", "");
    }

    private boolean isProgressProductionStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains("生产") || n.contains("车缝") || n.contains("缝制") || n.contains("缝纫") || n.contains("车工");
    }

    private boolean isProgressIroningStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains("整烫") || n.contains("熨烫");
    }

    private boolean isProgressCuttingStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains("裁剪") || n.contains("裁床") || n.contains("剪裁") || n.contains("开裁");
    }

    private boolean isProgressShipmentStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains("出货") || n.contains("发货") || n.contains("发运");
    }

    private boolean isBaseStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return progressStageNameMatches(STAGE_ORDER_CREATED, n) || progressStageNameMatches(STAGE_PROCUREMENT, n);
    }

    private boolean isProgressOrderCreatedStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains(STAGE_ORDER_CREATED) || n.contains("订单创建") || n.contains("创建订单") || n.contains("开单")
                || n.contains("制单");
    }

    private boolean isProgressProcurementStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains(STAGE_PROCUREMENT) || n.contains("物料采购") || n.contains("面辅料采购") || n.contains("备料")
                || n.contains("到料");
    }

    @Override
    public boolean isProgressQualityStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains("质检") || n.contains("检验") || n.contains("品检") || n.contains("验货");
    }

    @Override
    public boolean isProgressPackagingStageName(String name) {
        String n = normalizeStageName(name);
        if (!StringUtils.hasText(n)) {
            return false;
        }
        return n.contains("包装") || n.contains("后整") || n.contains("打包") || n.contains("装箱");
    }

    @Override
    public boolean progressStageNameMatches(String stageName, String recordProcessName) {
        String a = normalizeStageName(stageName);
        String b = normalizeStageName(recordProcessName);
        if (!StringUtils.hasText(a) || !StringUtils.hasText(b)) {
            return false;
        }
        if (a.equals(b)) {
            return true;
        }
        if (a.contains(b) || b.contains(a)) {
            return true;
        }
        // 优先使用同义词映射表进行匹配
        if (ProcessSynonymMapping.isEquivalent(a, b)) {
            return true;
        }
        if (isProgressOrderCreatedStageName(a) && isProgressOrderCreatedStageName(b)) {
            return true;
        }
        if (isProgressProcurementStageName(a) && isProgressProcurementStageName(b)) {
            return true;
        }
        if (isProgressCuttingStageName(a) && isProgressCuttingStageName(b)) {
            return true;
        }
        if (isProgressQualityStageName(a) && isProgressQualityStageName(b)) {
            return true;
        }
        if (isProgressPackagingStageName(a) && isProgressPackagingStageName(b)) {
            return true;
        }
        if (isProgressIroningStageName(a) && isProgressIroningStageName(b)) {
            return true;
        }
        if (isProgressProductionStageName(a) && isProgressProductionStageName(b)) {
            return true;
        }
        if (isProgressShipmentStageName(a) && isProgressShipmentStageName(b)) {
            return true;
        }
        return false;
    }

    private TemplateLibrary resolveProgressTemplate(String styleNo) {
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        String cacheKey = sn != null ? sn : "__default__";
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
        String cacheKey = sn != null ? sn : "__default__";
        TemplateLibrary cached = processPriceTemplateCache.getIfPresent(cacheKey);
        if (cached != null) {
            return cached;
        }
        TemplateLibrary tpl = null;
        try {
            if (StringUtils.hasText(sn)) {
                tpl = getOne(new LambdaQueryWrapper<TemplateLibrary>()
                        .eq(TemplateLibrary::getTemplateType, "process_price")
                        .eq(TemplateLibrary::getSourceStyleNo, sn)
                        .orderByDesc(TemplateLibrary::getUpdateTime)
                        .orderByDesc(TemplateLibrary::getCreateTime)
                        .last("limit 1"));
            }

            if (tpl == null) {
                tpl = getOne(new LambdaQueryWrapper<TemplateLibrary>()
                        .eq(TemplateLibrary::getTemplateType, "process_price")
                        .eq(TemplateLibrary::getTemplateKey, "default")
                        .orderByDesc(TemplateLibrary::getUpdateTime)
                        .orderByDesc(TemplateLibrary::getCreateTime)
                        .last("limit 1"));
            }

            if (tpl == null) {
                tpl = getOne(new LambdaQueryWrapper<TemplateLibrary>()
                        .eq(TemplateLibrary::getTemplateType, "process_price")
                        .orderByDesc(TemplateLibrary::getUpdateTime)
                        .orderByDesc(TemplateLibrary::getCreateTime)
                        .last("limit 1"));
            }
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

        // 如果命中的是系统默认模板（非款式专属），尝试从该款式的 process 类型模板
        // 读取 steps[].processName 作为实际工序顺序，避免使用硬编码的默认工序名（缝制/整烫/检验等）
        if (!isStyleSpecific && StringUtils.hasText(sn)) {
            List<String> fromProcess = resolveNodesFromStyleProcessTemplate(sn);
            if (!fromProcess.isEmpty()) {
                return fromProcess;
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
                // 排除入库（由质检入库模块处理）和二次工艺（由专属 tab 处理）
                if ("入库".equals(progressStage) || "二次工艺".equals(progressStage)) {
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
            BigDecimal up = toBigDecimal(n.get("unitPrice"));
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
        List<Map<String, Object>> out = new ArrayList<>();
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : "";
        if (!StringUtils.hasText(sn)) {
            return out;
        }

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

                        // 读取标准工时
                        Integer standardTime = null;
                        if (step.hasNonNull("standardTime")) {
                            standardTime = step.get("standardTime").asInt(0);
                        }

                        Map<String, Object> item = new LinkedHashMap<>();
                        item.put("id", processCode.trim());
                        item.put("name", processName);
                        item.put("unitPrice", up.setScale(2, RoundingMode.HALF_UP));
                        item.put("progressStage", progressStage.trim());
                        if (StringUtils.hasText(machineType)) {
                            item.put("machineType", machineType);
                        }
                        if (standardTime != null && standardTime > 0) {
                            item.put("standardTime", standardTime);
                        }
                        out.add(item);
                    }

                    if (!out.isEmpty()) {
                        log.info("resolveProgressNodeUnitPrices from process template: styleNo={}, count={}", sn, out.size());
                        return out;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to resolve from process template: styleNo={}", sn, e);
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
        processOrder.add(STAGE_ORDER_CREATED);
        processOrder.add(STAGE_PROCUREMENT);

        weights.put(STAGE_ORDER_CREATED, new BigDecimal("5"));
        weights.put(STAGE_PROCUREMENT, new BigDecimal("15"));

        List<String> nodes = resolveProgressNodes(styleNo);

        // 确保裁剪环节存在（如果模板中未定义，则默认插入到采购之后）
        boolean hasCutting = false;
        for (String n : nodes) {
            if (isProgressCuttingStageName(n)) {
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
            if (!isBaseStageName(pn)) {
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
                if (isBaseStageName(pn)) {
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
                .eq(StringUtils.hasText(templateType), TemplateLibrary::getTemplateType, templateType)
                .like(StringUtils.hasText(keyword), TemplateLibrary::getTemplateName, keyword)
                .eq(StringUtils.hasText(sourceStyleNo), TemplateLibrary::getSourceStyleNo, sourceStyleNo)
                .orderByDesc(TemplateLibrary::getUpdateTime)
                .orderByDesc(TemplateLibrary::getCreateTime);

        return baseMapper.selectPage(pageInfo, wrapper);
    }

    @Override
    public List<TemplateLibrary> listByType(String templateType) {
        String t = String.valueOf(templateType == null ? "" : templateType).trim();
        if (!StringUtils.hasText(t)) {
            return List.of();
        }
        return list(new LambdaQueryWrapper<TemplateLibrary>()
                .eq(TemplateLibrary::getTemplateType, t)
                .orderByAsc(TemplateLibrary::getTemplateName)
                .orderByAsc(TemplateLibrary::getTemplateKey));
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
                    progressTemplateCache.invalidate(sourceStyleNo.trim());
                }
                progressTemplateCache.invalidate("__default__");
            } else if ("process_price".equals(templateType)) {
                if (StringUtils.hasText(sourceStyleNo)) {
                    processPriceTemplateCache.invalidate(sourceStyleNo.trim());
                }
                processPriceTemplateCache.invalidate("__default__");
            }
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
            List<Map<String, Object>> steps = coerceListOfMap(content.get("steps"));

            for (Map<String, Object> step : steps) {
                if (step == null) continue;

                String processName = String.valueOf(step.getOrDefault("processName", "")).trim();
                if (!StringUtils.hasText(processName)) {
                    processName = String.valueOf(step.getOrDefault("name", "")).trim();
                }
                if (!StringUtils.hasText(processName)) continue;

                Object priceObj = step.containsKey("unitPrice") ? step.get("unitPrice") : step.get("price");
                BigDecimal price = toBigDecimal(priceObj);
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
        List<Map<String, Object>> items = coerceListOfMap(content.get("steps"));
        if (items == null || items.isEmpty()) {
            items = coerceListOfMap(content.get("nodes"));
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
            BigDecimal p = toBigDecimal(v);
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

    private static Map<String, Object> coerceMap(Object v) {
        if (v instanceof Map<?, ?> m) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (e.getKey() == null)
                    continue;
                out.put(String.valueOf(e.getKey()), e.getValue());
            }
            return out;
        }
        return new LinkedHashMap<>();
    }

    private static List<Map<String, Object>> coerceListOfMap(Object v) {
        if (!(v instanceof List)) {
            return List.of();
        }
        List<?> list = (List<?>) v;
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map) {
                out.add(coerceMap(item));
            }
        }
        return out;
    }

    private static List<String> coerceListOfString(Object v) {
        if (!(v instanceof List)) {
            return List.of();
        }
        List<?> list = (List<?>) v;
        List<String> out = new ArrayList<>();
        for (Object item : list) {
            if (item == null)
                continue;
            String s = String.valueOf(item).trim();
            if (StringUtils.hasText(s))
                out.add(s);
        }
        return out;
    }

    private static BigDecimal toBigDecimal(Object v) {
        if (v == null)
            return BigDecimal.ZERO;
        if (v instanceof BigDecimal decimal)
            return decimal;
        try {
            return new BigDecimal(String.valueOf(v));
        } catch (Exception e) {
            return BigDecimal.ZERO;
        }
    }
}
