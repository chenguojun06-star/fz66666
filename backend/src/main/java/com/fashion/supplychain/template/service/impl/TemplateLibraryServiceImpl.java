package com.fashion.supplychain.template.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.entity.StyleSize;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.style.service.StyleSizeService;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.mapper.TemplateLibraryMapper;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
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

    private static final String STAGE_ORDER_CREATED = "下单";
    private static final String STAGE_PROCUREMENT = "采购";

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleSizeService styleSizeService;

    @Autowired
    private StyleProcessService styleProcessService;

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

        return tpl;
    }

    private TemplateLibrary resolveProcessPriceTemplate(String styleNo) {
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
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

        return tpl;
    }

    @Override
    public List<String> resolveProgressNodes(String styleNo) {
        TemplateLibrary tpl = resolveProgressTemplate(styleNo);
        if (tpl == null || !StringUtils.hasText(tpl.getTemplateContent())) {
            return new ArrayList<>();
        }

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

        return nodes;
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
        TemplateLibrary tpl = resolveProgressTemplate(styleNo);
        Map<String, BigDecimal> processPrices;
        try {
            processPrices = resolveProcessUnitPrices(styleNo);
        } catch (Exception e) {
            processPrices = new LinkedHashMap<>();
        }

        List<Map<String, Object>> out = new ArrayList<>();

        if (tpl == null || !StringUtils.hasText(tpl.getTemplateContent())) {
            if (processPrices == null || processPrices.isEmpty()) {
                return out;
            }
            for (Map.Entry<String, BigDecimal> e : processPrices.entrySet()) {
                if (e == null) {
                    continue;
                }
                String name = StringUtils.hasText(e.getKey()) ? e.getKey().trim() : "";
                if (!StringUtils.hasText(name)) {
                    continue;
                }
                BigDecimal up = e.getValue();
                if (up == null || up.compareTo(BigDecimal.ZERO) < 0) {
                    up = BigDecimal.ZERO;
                }
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", name);
                item.put("name", name);
                item.put("unitPrice", up.setScale(2, RoundingMode.HALF_UP));
                out.add(item);
            }
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

                    if (processPrices != null && !processPrices.isEmpty()) {
                        BigDecimal matched = matchProcessUnitPrice(processPrices, name);
                        if (matched != null && matched.compareTo(BigDecimal.ZERO) > 0) {
                            up = matched;
                        }
                    }

                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", id);
                    item.put("name", name);
                    item.put("unitPrice", up.setScale(2, RoundingMode.HALF_UP));
                    out.add(item);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to resolve progress node unit prices: styleNo={}, templateId={}",
                    StringUtils.hasText(styleNo) ? styleNo.trim() : null,
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
    public List<TemplateLibrary> createFromStyle(String sourceStyleNo, List<String> templateTypes) {
        String sn = String.valueOf(sourceStyleNo == null ? "" : sourceStyleNo).trim();
        if (!StringUtils.hasText(sn)) {
            throw new IllegalArgumentException("sourceStyleNo不能为空");
        }
        StyleInfo style = styleInfoService.lambdaQuery().eq(StyleInfo::getStyleNo, sn).one();
        if (style == null || style.getId() == null) {
            throw new NoSuchElementException("款号不存在");
        }

        Set<String> typeSet;
        if (templateTypes == null || templateTypes.isEmpty()) {
            typeSet = Set.of("bom", "size", "process", "process_price", "progress");
        } else {
            typeSet = templateTypes.stream()
                    .filter(Objects::nonNull)
                    .map(s -> String.valueOf(s).trim().toLowerCase())
                    .filter(StringUtils::hasText)
                    .collect(Collectors.toSet());
        }

        List<TemplateLibrary> created = new ArrayList<>();
        String templateKey = "style_" + sn;

        if (typeSet.contains("bom")) {
            List<StyleBom> rows = styleBomService.listByStyleId(style.getId());
            List<Map<String, Object>> mapped = new ArrayList<>();
            for (StyleBom r : rows) {
                if (r == null)
                    continue;
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("materialType", String.valueOf(r.getMaterialType() == null ? "" : r.getMaterialType()));
                item.put("materialName", String.valueOf(r.getMaterialName() == null ? "" : r.getMaterialName()));
                item.put("color", String.valueOf(r.getColor() == null ? "" : r.getColor()));
                item.put("specification", String.valueOf(r.getSpecification() == null ? "" : r.getSpecification()));
                item.put("unit", String.valueOf(r.getUnit() == null ? "" : r.getUnit()));
                item.put("usageAmount", r.getUsageAmount() == null ? 0 : r.getUsageAmount());
                item.put("lossRate", r.getLossRate() == null ? 0 : r.getLossRate());
                item.put("unitPrice", r.getUnitPrice() == null ? 0 : r.getUnitPrice());
                item.put("supplier", String.valueOf(r.getSupplier() == null ? "" : r.getSupplier()));
                item.put("codePrefix", "MAT");
                mapped.add(item);
            }
            Map<String, Object> content = new LinkedHashMap<>();
            content.put("rows", mapped);
            created.add(upsertTemplate("bom", templateKey, sn + "-BOM模板", sn, content));
        }

        if (typeSet.contains("process")) {
            List<StyleProcess> rows = styleProcessService.listByStyleId(style.getId());
            List<Map<String, Object>> steps = new ArrayList<>();
            for (StyleProcess p : rows) {
                if (p == null)
                    continue;
                Map<String, Object> step = new LinkedHashMap<>();
                step.put("processCode", String.valueOf(p.getProcessCode() == null ? "" : p.getProcessCode()));
                step.put("processName", String.valueOf(p.getProcessName() == null ? "" : p.getProcessName()));
                step.put("machineType", String.valueOf(p.getMachineType() == null ? "" : p.getMachineType()));
                step.put("price", p.getPrice());
                step.put("standardTime", p.getStandardTime());
                steps.add(step);
            }
            Map<String, Object> content = new LinkedHashMap<>();
            content.put("steps", steps);
            created.add(upsertTemplate("process", templateKey, sn + "-工艺模板", sn, content));
        }

        if (typeSet.contains("process_price")) {
            List<StyleProcess> rows = styleProcessService.listByStyleId(style.getId());
            List<Map<String, Object>> steps = new ArrayList<>();
            for (StyleProcess p : rows) {
                if (p == null) {
                    continue;
                }
                Map<String, Object> step = new LinkedHashMap<>();
                step.put("processCode", String.valueOf(p.getProcessCode() == null ? "" : p.getProcessCode()));
                step.put("processName", String.valueOf(p.getProcessName() == null ? "" : p.getProcessName()));
                step.put("unitPrice", p.getPrice());
                steps.add(step);
            }
            Map<String, Object> content = new LinkedHashMap<>();
            content.put("steps", steps);
            created.add(upsertTemplate("process_price", templateKey, sn + "-工序单价模板", sn, content));
        }

        if (typeSet.contains("size")) {
            List<StyleSize> list = styleSizeService.listByStyleId(style.getId());
            List<String> sizes = list.stream()
                    .filter(Objects::nonNull)
                    .map(StyleSize::getSizeName)
                    .filter(StringUtils::hasText)
                    .map(s -> String.valueOf(s).trim())
                    .distinct()
                    .collect(Collectors.toList());

            Map<String, Map<String, StyleSize>> byPart = new LinkedHashMap<>();
            for (StyleSize r : list) {
                if (r == null)
                    continue;
                String part = String.valueOf(r.getPartName() == null ? "" : r.getPartName()).trim();
                String size = String.valueOf(r.getSizeName() == null ? "" : r.getSizeName()).trim();
                if (!StringUtils.hasText(part) || !StringUtils.hasText(size))
                    continue;
                byPart.computeIfAbsent(part, k -> new LinkedHashMap<>()).put(size, r);
            }

            List<Map<String, Object>> parts = new ArrayList<>();
            int idx = 0;
            for (Map.Entry<String, Map<String, StyleSize>> entry : byPart.entrySet()) {
                String partName = entry.getKey();
                Map<String, StyleSize> mp = entry.getValue();
                Map<String, Object> part = new LinkedHashMap<>();
                part.put("partName", partName);
                StyleSize any = mp.values().stream().filter(Objects::nonNull).findFirst().orElse(null);
                part.put("measureMethod",
                        any != null ? String.valueOf(any.getMeasureMethod() == null ? "" : any.getMeasureMethod())
                                : "");
                part.put("tolerance", any != null && any.getTolerance() != null ? any.getTolerance() : 0);

                Map<String, Object> values = new LinkedHashMap<>();
                for (String sizeName : sizes) {
                    StyleSize cell = mp.get(sizeName);
                    BigDecimal v = cell == null ? BigDecimal.ZERO
                            : (cell.getStandardValue() == null ? BigDecimal.ZERO : cell.getStandardValue());
                    values.put(sizeName, v);
                }
                part.put("values", values);
                part.put("sort", idx);
                idx += 1;
                parts.add(part);
            }

            Map<String, Object> content = new LinkedHashMap<>();
            content.put("sizes", sizes);
            content.put("parts", parts);
            created.add(upsertTemplate("size", templateKey, sn + "-尺码模板", sn, content));
        }

        if (typeSet.contains("progress")) {
            Map<String, Object> content = new LinkedHashMap<>();

            List<Map<String, Object>> nodes = new ArrayList<>();
            try {
                List<StyleProcess> steps = styleProcessService.listByStyleId(style.getId());
                Set<String> seen = new LinkedHashSet<>();
                for (StyleProcess p : steps) {
                    if (p == null) {
                        continue;
                    }
                    String name = String.valueOf(p.getProcessName() == null ? "" : p.getProcessName()).trim();
                    if (!StringUtils.hasText(name)) {
                        continue;
                    }
                    if (!seen.add(name)) {
                        continue;
                    }
                    Map<String, Object> node = new LinkedHashMap<>();
                    node.put("name", name);
                    BigDecimal price = p.getPrice() == null ? BigDecimal.ZERO : p.getPrice();
                    if (price.compareTo(BigDecimal.ZERO) < 0) {
                        price = BigDecimal.ZERO;
                    }
                    node.put("unitPrice", price);
                    nodes.add(node);
                }
            } catch (Exception e) {
                log.warn("Failed to build progress nodes from style process: styleId={}, styleNo={}",
                        style.getId(),
                        StringUtils.hasText(sn) ? sn.trim() : null,
                        e);
            }

            if (nodes.isEmpty()) {
                nodes = List.of(
                        Map.of("name", "裁剪", "unitPrice", 0),
                        Map.of("name", "生产", "unitPrice", 0),
                        Map.of("name", "整烫", "unitPrice", 0),
                        Map.of("name", "质检", "unitPrice", 0),
                        Map.of("name", "包装", "unitPrice", 0),
                        Map.of("name", "入库", "unitPrice", 0));
            }
            content.put("nodes", nodes);

            created.add(upsertTemplate("progress", templateKey, sn + "-进度模板", sn, content));
        }

        return created;
    }

    @Override
    public boolean applyToStyle(String templateId, Long targetStyleId, String mode) {
        String tid = String.valueOf(templateId == null ? "" : templateId).trim();
        if (!StringUtils.hasText(tid)) {
            throw new IllegalArgumentException("templateId不能为空");
        }
        if (targetStyleId == null) {
            throw new IllegalArgumentException("targetStyleId不能为空");
        }

        StyleInfo style = styleInfoService.getById(targetStyleId);
        if (style == null) {
            throw new NoSuchElementException("目标款号不存在");
        }

        String status = String.valueOf(style.getPatternStatus() == null ? "" : style.getPatternStatus()).trim();
        if ("COMPLETED".equalsIgnoreCase(status)) {
            throw new IllegalArgumentException("纸样已完成，无法修改，请先回退");
        }

        TemplateLibrary tpl = getById(tid);
        if (tpl == null) {
            throw new NoSuchElementException("模板不存在");
        }

        String templateType = String.valueOf(tpl.getTemplateType() == null ? "" : tpl.getTemplateType()).trim()
                .toLowerCase();
        String m = String.valueOf(mode == null ? "" : mode).trim().toLowerCase();
        boolean overwrite = "overwrite".equals(m) || "cover".equals(m) || "true".equals(m);

        if ("bom".equals(templateType)) {
            return applyBomTemplate(tpl, targetStyleId, overwrite);
        }
        if ("size".equals(templateType)) {
            return applySizeTemplate(tpl, targetStyleId, overwrite);
        }
        if ("process".equals(templateType)) {
            return applyProcessTemplate(tpl, targetStyleId, overwrite);
        }

        if ("process_price".equals(templateType)) {
            return applyProcessPriceTemplate(tpl, targetStyleId, overwrite);
        }

        if ("progress".equals(templateType)) {
            throw new IllegalArgumentException("进度模板请在生产进度中导入");
        }

        throw new IllegalArgumentException("不支持的模板类型");
    }

    @Override
    public Map<String, BigDecimal> resolveProcessUnitPrices(String styleNo) {
        TemplateLibrary tpl = resolveProcessPriceTemplate(styleNo);
        if (tpl == null || !StringUtils.hasText(tpl.getTemplateContent())) {
            return new LinkedHashMap<>();
        }
        Map<String, Object> content = parseContentMap(tpl.getTemplateContent());
        List<Map<String, Object>> steps = coerceListOfMap(content.get("steps"));
        LinkedHashMap<String, BigDecimal> out = new LinkedHashMap<>();
        for (Map<String, Object> s : steps) {
            if (s == null) {
                continue;
            }
            String name = String.valueOf(s.getOrDefault("processName", "")).trim();
            if (!StringUtils.hasText(name)) {
                continue;
            }
            Object v = s.containsKey("unitPrice") ? s.get("unitPrice") : s.get("price");
            BigDecimal p = toBigDecimal(v);
            out.put(name, p);
        }
        return out;
    }

    private TemplateLibrary upsertTemplate(String type, String key, String name, String sourceStyleNo, Object content) {
        String t = String.valueOf(type == null ? "" : type).trim().toLowerCase();
        String k = String.valueOf(key == null ? "" : key).trim();
        String n = String.valueOf(name == null ? "" : name).trim();
        String ssn = String.valueOf(sourceStyleNo == null ? "" : sourceStyleNo).trim();

        if (!StringUtils.hasText(t) || !StringUtils.hasText(k) || !StringUtils.hasText(n)) {
            throw new IllegalArgumentException("模板参数不完整");
        }

        String json;
        try {
            json = objectMapper.writeValueAsString(content);
        } catch (Exception e) {
            throw new IllegalArgumentException("模板内容序列化失败");
        }

        TemplateLibrary existing = getOne(new LambdaQueryWrapper<TemplateLibrary>()
                .eq(TemplateLibrary::getTemplateType, t)
                .eq(TemplateLibrary::getTemplateKey, k)
                .last("LIMIT 1"));

        LocalDateTime now = LocalDateTime.now();
        if (existing != null) {
            String existingKey = String.valueOf(existing.getTemplateKey() == null ? "" : existing.getTemplateKey())
                    .trim();
            String existingName = String.valueOf(existing.getTemplateName() == null ? "" : existing.getTemplateName())
                    .trim();
            boolean isStyleAutoKey = StringUtils.hasText(existingKey) && existingKey.startsWith("style_");
            if (!isStyleAutoKey || !StringUtils.hasText(existingName) || existingName.equals(n)) {
                existing.setTemplateName(n);
            }
            existing.setSourceStyleNo(StringUtils.hasText(ssn) ? ssn : null);
            existing.setTemplateContent(json);
            existing.setLocked(1);
            existing.setUpdateTime(now);
            updateById(existing);
            return existing;
        }

        TemplateLibrary created = new TemplateLibrary();
        created.setId(UUID.randomUUID().toString());
        created.setTemplateType(t);
        created.setTemplateKey(k);
        created.setTemplateName(n);
        created.setSourceStyleNo(StringUtils.hasText(ssn) ? ssn : null);
        created.setTemplateContent(json);
        created.setLocked(1);
        created.setCreateTime(now);
        created.setUpdateTime(now);
        save(created);
        return created;
    }

    private boolean applyBomTemplate(TemplateLibrary tpl, Long targetStyleId, boolean overwrite) {
        Map<String, Object> content = parseContentMap(tpl.getTemplateContent());
        Object rowsRaw = content.get("rows");
        List<Map<String, Object>> rows = coerceListOfMap(rowsRaw);

        if (overwrite) {
            styleBomService.remove(new LambdaQueryWrapper<StyleBom>().eq(StyleBom::getStyleId, targetStyleId));
        }

        String stamp = String.valueOf(System.currentTimeMillis());
        String suffix = stamp.substring(Math.max(0, stamp.length() - 6));

        List<StyleBom> toSave = new ArrayList<>();
        int i = 0;
        for (Map<String, Object> r : rows) {
            if (r == null)
                continue;
            String codePrefix = String.valueOf(r.getOrDefault("codePrefix", "MAT")).trim();
            if (!StringUtils.hasText(codePrefix))
                codePrefix = "MAT";
            i += 1;

            StyleBom b = new StyleBom();
            b.setStyleId(targetStyleId);
            b.setMaterialType(String.valueOf(r.getOrDefault("materialType", "")).trim());
            b.setMaterialName(String.valueOf(r.getOrDefault("materialName", "")).trim());
            b.setColor(String.valueOf(r.getOrDefault("color", "")).trim());
            b.setSpecification(String.valueOf(r.getOrDefault("specification", "")).trim());
            b.setSize(String.valueOf(r.getOrDefault("size", "")).trim());
            b.setUnit(String.valueOf(r.getOrDefault("unit", "")).trim());
            b.setSupplier(String.valueOf(r.getOrDefault("supplier", "")).trim());

            BigDecimal usageAmount = toBigDecimal(r.get("usageAmount"));
            BigDecimal lossRate = toBigDecimal(r.get("lossRate"));
            BigDecimal unitPrice = toBigDecimal(r.get("unitPrice"));

            b.setUsageAmount(usageAmount);
            b.setLossRate(lossRate);
            b.setUnitPrice(unitPrice);
            b.setMaterialCode(codePrefix + "-" + suffix + "-" + "%02d".formatted(i));
            b.setTotalPrice(calcBomTotal(usageAmount, lossRate, unitPrice));
            b.setCreateTime(LocalDateTime.now());
            b.setUpdateTime(LocalDateTime.now());
            toSave.add(b);
        }

        if (toSave.isEmpty()) {
            return true;
        }
        return styleBomService.saveBatch(toSave);
    }

    private boolean applyProcessTemplate(TemplateLibrary tpl, Long targetStyleId, boolean overwrite) {
        Map<String, Object> content = parseContentMap(tpl.getTemplateContent());
        List<Map<String, Object>> steps = coerceListOfMap(content.get("steps"));

        if (overwrite) {
            styleProcessService
                    .remove(new LambdaQueryWrapper<StyleProcess>().eq(StyleProcess::getStyleId, targetStyleId));
        }

        List<StyleProcess> toSave = new ArrayList<>();
        int idx = 0;
        for (Map<String, Object> s : steps) {
            if (s == null)
                continue;
            idx += 1;
            StyleProcess p = new StyleProcess();
            p.setStyleId(targetStyleId);
            p.setProcessCode(String.valueOf(s.getOrDefault("processCode", "")).trim());
            p.setProcessName(String.valueOf(s.getOrDefault("processName", "")).trim());
            p.setMachineType(String.valueOf(s.getOrDefault("machineType", "")).trim());
            p.setPrice(toBigDecimal(s.get("price")));
            BigDecimal stdTime = toBigDecimal(s.get("standardTime"));
            p.setStandardTime(stdTime == null ? 0 : stdTime.intValue());
            p.setSortOrder(idx);
            p.setCreateTime(LocalDateTime.now());
            p.setUpdateTime(LocalDateTime.now());
            toSave.add(p);
        }
        if (toSave.isEmpty()) {
            return true;
        }
        return styleProcessService.saveBatch(toSave);
    }

    private boolean applyProcessPriceTemplate(TemplateLibrary tpl, Long targetStyleId, boolean overwrite) {
        Map<String, Object> content = parseContentMap(tpl.getTemplateContent());
        List<Map<String, Object>> steps = coerceListOfMap(content.get("steps"));
        if (steps.isEmpty()) {
            return true;
        }

        LinkedHashMap<String, BigDecimal> byCode = new LinkedHashMap<>();
        LinkedHashMap<String, BigDecimal> byName = new LinkedHashMap<>();
        for (Map<String, Object> s : steps) {
            if (s == null) {
                continue;
            }
            String code = norm(String.valueOf(s.getOrDefault("processCode", "")));
            String name = norm(String.valueOf(s.getOrDefault("processName", "")));
            Object v = s.containsKey("unitPrice") ? s.get("unitPrice") : s.get("price");
            BigDecimal p = toBigDecimal(v);
            if (StringUtils.hasText(code)) {
                byCode.put(code, p);
            }
            if (StringUtils.hasText(name)) {
                byName.put(name, p);
            }
        }

        List<StyleProcess> existing = styleProcessService
                .list(new LambdaQueryWrapper<StyleProcess>().eq(StyleProcess::getStyleId, targetStyleId));
        if (existing == null || existing.isEmpty()) {
            return true;
        }

        LocalDateTime now = LocalDateTime.now();
        List<StyleProcess> toUpdate = new ArrayList<>();
        for (StyleProcess p : existing) {
            if (p == null || !StringUtils.hasText(p.getId())) {
                continue;
            }
            String codeKey = norm(p.getProcessCode());
            String nameKey = norm(p.getProcessName());
            BigDecimal next = null;
            if (StringUtils.hasText(codeKey) && byCode.containsKey(codeKey)) {
                next = byCode.get(codeKey);
            } else if (StringUtils.hasText(nameKey) && byName.containsKey(nameKey)) {
                next = byName.get(nameKey);
            }
            if (next == null) {
                continue;
            }

            BigDecimal cur = p.getPrice() == null ? BigDecimal.ZERO : p.getPrice();
            if (!overwrite && cur.compareTo(BigDecimal.ZERO) > 0) {
                continue;
            }
            p.setPrice(next);
            p.setUpdateTime(now);
            toUpdate.add(p);
        }

        if (toUpdate.isEmpty()) {
            return true;
        }
        return styleProcessService.updateBatchById(toUpdate);
    }

    private static String norm(String s) {
        if (s == null) {
            return null;
        }
        String v = s.trim();
        if (!StringUtils.hasText(v)) {
            return null;
        }
        return v.toLowerCase();
    }

    private boolean applySizeTemplate(TemplateLibrary tpl, Long targetStyleId, boolean overwrite) {
        Map<String, Object> content = parseContentMap(tpl.getTemplateContent());
        List<String> sizes = coerceListOfString(content.get("sizes"));
        List<Map<String, Object>> parts = coerceListOfMap(content.get("parts"));

        if (overwrite) {
            styleSizeService.remove(new LambdaQueryWrapper<StyleSize>().eq(StyleSize::getStyleId, targetStyleId));
        }

        List<StyleSize> toSave = new ArrayList<>();
        int sort = 0;
        for (Map<String, Object> p : parts) {
            if (p == null)
                continue;
            String partName = String.valueOf(p.getOrDefault("partName", "")).trim();
            if (!StringUtils.hasText(partName))
                continue;
            String measureMethod = String.valueOf(p.getOrDefault("measureMethod", "")).trim();
            BigDecimal tolerance = toBigDecimal(p.get("tolerance"));
            Map<String, Object> values = coerceMap(p.get("values"));

            for (String sizeName : sizes) {
                if (!StringUtils.hasText(sizeName))
                    continue;
                StyleSize row = new StyleSize();
                row.setStyleId(targetStyleId);
                row.setSizeName(sizeName);
                row.setPartName(partName);
                row.setMeasureMethod(measureMethod);
                row.setTolerance(tolerance);
                row.setSort(sort);
                row.setStandardValue(toBigDecimal(values.get(sizeName)));
                row.setCreateTime(LocalDateTime.now());
                row.setUpdateTime(LocalDateTime.now());
                toSave.add(row);
            }
            sort += 1;
        }

        if (toSave.isEmpty()) {
            return true;
        }
        return styleSizeService.saveBatch(toSave);
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

    private static BigDecimal calcBomTotal(BigDecimal usageAmount, BigDecimal lossRate, BigDecimal unitPrice) {
        BigDecimal u = usageAmount == null ? BigDecimal.ZERO : usageAmount;
        BigDecimal l = lossRate == null ? BigDecimal.ZERO : lossRate;
        BigDecimal p = unitPrice == null ? BigDecimal.ZERO : unitPrice;
        BigDecimal qty = u.multiply(BigDecimal.ONE.add(l.movePointLeft(2)));
        return qty.multiply(p);
    }
}
