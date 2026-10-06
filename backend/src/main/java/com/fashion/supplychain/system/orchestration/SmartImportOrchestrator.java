package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import com.fashion.supplychain.system.importer.ExcelImportHelper;
import com.fashion.supplychain.system.importer.InMemoryMultipartFile;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 智能导入编排器（D-751 二期）：租户把老系统导出的「任意格式 Excel」直接丢进来，
 * 规则精确匹配表头 → 别名词典 → 模糊包含 → AI 语义兜底，产出列映射让用户确认后导入。
 *
 * 防脏数据三道闸：①必填目标列缺失直接拒绝；②用户在预览里可纠正每一列的映射；
 * ③归一化后的行仍走既有导入器的逐行校验（重复/不存在引用/非法数字等）。
 * AI 只是建议来源之一，失败/超时/解析不出都静默降级为「规则映射结果」，绝不阻塞导入。
 */
@Service
@Slf4j
public class SmartImportOrchestrator {

    private static final int MAX_HEADERS_FOR_AI = 40;
    private static final int SAMPLE_ROW_COUNT = 3;

    /** 别名词典：目标标准列 → 常见源表头叫法（不含已可精确匹配的本身） */
    private static final Map<String, List<String>> FIELD_ALIASES = buildAliases();

    @Autowired
    private ExcelImportOrchestrator excelImportOrchestrator;

    @Autowired
    private ExcelImportHelper importHelper;

    @Autowired
    private AiInferenceGateway aiInferenceGateway;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 智能识别表头：返回源表头、候选目标列、每列建议映射及依据、前几行样例。
     */
    public Map<String, Object> smartMap(String type, MultipartFile file) {
        ExcelImportHelper.TemplateConfig template = excelImportOrchestrator.templateConfigOf(type);
        ExcelImportHelper.LooseSheet sheet = importHelper.parseSheetLoose(file);
        if (sheet.rows.isEmpty()) {
            throw new IllegalArgumentException("Excel 文件没有数据行");
        }

        List<String> canonical = List.of(template.headers);
        Map<String, String> mapping = new LinkedHashMap<>();
        Map<String, String> matchedBy = new LinkedHashMap<>();

        for (String sourceHeader : sheet.headers) {
            String hit = matchByRules(sourceHeader, canonical);
            if (hit != null) {
                mapping.put(sourceHeader, hit);
                matchedBy.put(sourceHeader, "rule");
            } else {
                mapping.put(sourceHeader, null);
            }
        }

        List<String> unresolved = new ArrayList<>();
        for (Map.Entry<String, String> e : mapping.entrySet()) {
            if (e.getValue() == null) unresolved.add(e.getKey());
        }
        if (!unresolved.isEmpty() && unresolved.size() <= MAX_HEADERS_FOR_AI) {
            try {
                aiFillUnresolved(type, canonical, unresolved, mapping, matchedBy);
            } catch (Exception e) {
                log.warn("[智能导入] AI 映射降级为规则结果: {}", e.getMessage());
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("headers", sheet.headers);
        result.put("canonicalFields", canonical);
        result.put("mapping", mapping);
        result.put("matchedBy", matchedBy);
        result.put("samples", buildSamples(sheet));
        result.put("totalRows", sheet.rows.size());
        return result;
    }

    /**
     * 按用户确认的映射归一化工作簿，走既有导入器入库。
     * mapping：源表头 → 目标标准列（null/缺省 = 该列不导入）。
     */
    public Map<String, Object> importMapped(Long tenantId, String type, MultipartFile file,
                                            Map<String, String> mapping) {
        ExcelImportHelper.TemplateConfig template = excelImportOrchestrator.templateConfigOf(type);
        if (mapping == null || mapping.isEmpty()) {
            throw new IllegalArgumentException("缺少列映射，请先完成表头识别");
        }

        List<String> requiredMissing = new ArrayList<>();
        for (String canonical : template.headers) {
            if (canonical.endsWith("*") && !mapping.containsValue(canonical)) {
                requiredMissing.add(canonical);
            }
        }
        if (!requiredMissing.isEmpty()) {
            throw new IllegalArgumentException("必填列未映射: " + String.join("、", requiredMissing));
        }

        ExcelImportHelper.LooseSheet sheet = importHelper.parseSheetLoose(file);
        List<Map<String, String>> canonicalRows = new ArrayList<>();
        for (Map<String, String> sourceRow : sheet.rows) {
            Map<String, String> canonicalRow = new LinkedHashMap<>();
            for (Map.Entry<String, String> e : mapping.entrySet()) {
                if (!StringUtils.hasText(e.getValue())) continue;
                canonicalRow.put(e.getValue(), sourceRow.getOrDefault(e.getKey(), ""));
            }
            canonicalRows.add(canonicalRow);
        }
        if (canonicalRows.isEmpty()) {
            throw new IllegalArgumentException("Excel 文件没有数据行");
        }
        if (canonicalRows.size() > 500) {
            throw new IllegalArgumentException("单次最多导入 500 条，当前 " + canonicalRows.size() + " 条");
        }

        byte[] normalized = importHelper.buildWorkbookFromRows(template, canonicalRows);
        MultipartFile normalizedFile = new InMemoryMultipartFile(
                "file", "smart-import.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", normalized);

        log.info("[智能导入] 租户={}, 类型={}, 源列={}, 已映射={}, 行数={}",
                tenantId, type, sheet.headers.size(),
                mapping.values().stream().filter(StringUtils::hasText).distinct().count(),
                canonicalRows.size());
        return excelImportOrchestrator.importByType(tenantId, type, normalizedFile);
    }

    /** 规则层：精确 → 别名 → 归一化模糊包含 */
    private String matchByRules(String sourceHeader, List<String> canonical) {
        String normalized = normalize(sourceHeader);
        if (!StringUtils.hasText(normalized)) return null;
        for (String c : canonical) {
            if (normalize(c).equals(normalized)) return c;
        }
        for (Map.Entry<String, List<String>> e : FIELD_ALIASES.entrySet()) {
            String target = findCanonical(e.getKey(), canonical);
            if (target == null) continue;
            for (String alias : e.getValue()) {
                if (normalize(alias).equals(normalized)) return target;
            }
        }
        for (String c : canonical) {
            String cn = normalize(c);
            if (!cn.isEmpty() && (cn.contains(normalized) || normalized.contains(cn))) return c;
        }
        return null;
    }

    private String findCanonical(String name, List<String> canonical) {
        for (String c : canonical) {
            if (normalize(c).equals(normalize(name))) return c;
        }
        return null;
    }

    /** AI 兜底：只对规则没认出的表头发问，单次调用，输出 JSON 映射 */
    private void aiFillUnresolved(String type, List<String> canonical, List<String> unresolved,
                                  Map<String, String> mapping, Map<String, String> matchedBy) {
        String systemPrompt = "你是服装供应链系统的数据导入助手。把用户老系统 Excel 的列名映射到系统标准列。"
                + "只输出 JSON 对象，键=源列名，值=标准列名（必须从候选中选）或 null（无对应）。不要输出任何其他文字。";
        String userMessage = "导入类型: " + type
                + "\n标准列候选: " + String.join(" | ", canonical)
                + "\n需要映射的源列: " + String.join(" | ", unresolved);
        String content;
        try {
            content = aiInferenceGateway.chat("excel-import-mapping", systemPrompt, userMessage).getContent();
        } catch (Exception e) {
            log.warn("[智能导入] AI 调用失败: {}", e.getMessage());
            return;
        }
        if (!StringUtils.hasText(content)) return;

        JsonNode node = parseJsonLenient(content);
        if (node == null || !node.isObject()) return;

        for (String sourceHeader : unresolved) {
            JsonNode hit = node.get(sourceHeader);
            if (hit == null) continue;
            String value = hit.isNull() ? null : hit.asText();
            if (!StringUtils.hasText(value)) continue;
            String canonicalHit = findCanonical(value, canonical);
            if (canonicalHit != null) {
                mapping.put(sourceHeader, canonicalHit);
                matchedBy.put(sourceHeader, "ai");
            }
        }
    }

    /** 剥掉 markdown 代码栅栏后解析 JSON，失败返回 null */
    private JsonNode parseJsonLenient(String content) {
        String text = content.trim();
        if (text.startsWith("```")) {
            text = text.replaceAll("^```[a-zA-Z]*\\s*", "").replaceAll("```\\s*$", "").trim();
        }
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
            return objectMapper.readTree(text.substring(start, end + 1));
        } catch (Exception e) {
            return null;
        }
    }

    private List<List<String>> buildSamples(ExcelImportHelper.LooseSheet sheet) {
        List<List<String>> samples = new ArrayList<>();
        for (Map<String, String> row : sheet.rows.subList(0, Math.min(SAMPLE_ROW_COUNT, sheet.rows.size()))) {
            List<String> cells = new ArrayList<>();
            for (String header : sheet.headers) {
                cells.add(row.getOrDefault(header, ""));
            }
            samples.add(cells);
        }
        return samples;
    }

    /** 归一化：去空白/星号/全角冒号等，转小写 */
    private String normalize(String s) {
        if (s == null) return "";
        return s.replace("*", "").replace("：", ":").replace("(", "").replace(")", "")
                .replace("（", "").replace("）", "").replace(" ", "").replace("　", "")
                .trim().toLowerCase(Locale.ROOT);
    }

    private static Map<String, List<String>> buildAliases() {
        Map<String, List<String>> m = new HashMap<>();
        m.put("款号*", List.of("款式编号", "款式货号", "货号", "款式", "款号编号", "styleNo", "style"));
        m.put("数量*", List.of("库存数量", "期初数量", "库存", "入库数量", "qty", "quantity"));
        m.put("客户名称*", List.of("客户", "公司名称", "客户公司", "客户名", "品牌", "品牌方", "客户全称", "company"));
        m.put("物料编码*", List.of("物料编号", "材料编码", "编码", "物料代码", "materialCode"));
        m.put("物料名称*", List.of("物料", "材料名称", "材料", "品名", "物料名", "materialName"));
        m.put("供应商名称", List.of("供应商", "厂家", "工厂", "供应商全称", "supplier", "factoryName"));
        m.put("联系人", List.of("联系人姓名", "联系人员", "对接人", "contact"));
        m.put("联系电话", List.of("电话", "手机", "手机号", "联系方式", "电话号码", "phone", "mobile"));
        m.put("邮箱", List.of("电子邮件", "电子邮箱", "email", "mail"));
        m.put("地址", List.of("详细地址", "公司地址", "联系地址", "address"));
        m.put("客户等级", List.of("等级", "客户级别", "级别", "客户分类", "level"));
        m.put("行业/品类", List.of("行业", "品类", "所属行业", "industry"));
        m.put("备注", List.of("说明", "备注说明", "remark", "note", "摘要"));
        m.put("类型", List.of("物料类型", "材料类型", "分类", "类别", "type"));
        m.put("颜色", List.of("色号", "色彩", "颜色名称", "color"));
        m.put("码数", List.of("尺码", "尺寸", "规格尺寸", "size"));
        m.put("库位", List.of("仓位", "存放位置", "货位", "储位", "location"));
        m.put("单价", List.of("价格", "成本价", "采购价", "进货价", "price"));
        m.put("单位", List.of("计量单位", "单位名称", "uom", "unit"));
        m.put("幅宽", List.of("门幅", "布封", "幅宽(cm)", "宽度"));
        m.put("克重", List.of("克重量", "克重(g)", "重量"));
        m.put("成分", List.of("面料成分", "成分含量", "材质", "composition"));
        m.put("规格", List.of("规格型号", "详细规格", "specification"));
        return m;
    }
}
