package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.ProcessSynonymMapping;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class CuttingWorkflowBuilderHelper {

    private static final List<String> STAGE_ORDER = List.of("采购", "裁剪", "二次工艺", "车缝", "尾部", "入库");

    private final TemplateLibraryService templateLibraryService;
    private final ProcessParentMappingService processParentMappingService;

    public CuttingWorkflowBuilderHelper(TemplateLibraryService templateLibraryService,
                                        ProcessParentMappingService processParentMappingService) {
        this.templateLibraryService = templateLibraryService;
        this.processParentMappingService = processParentMappingService;
    }

    public String resolveProgressWorkflowJson(Map<String, Object> body, String styleNo) {
        String progressWorkflowJson = getTrimmedText(body, "progressWorkflowJson");
        if (StringUtils.hasText(progressWorkflowJson) && !isBlankWorkflow(progressWorkflowJson)) {
            return progressWorkflowJson;
        }
        progressWorkflowJson = buildProgressWorkflowJson(styleNo);
        if (StringUtils.hasText(progressWorkflowJson)) {
            return progressWorkflowJson;
        }
        return buildCuttingDefaultWorkflowJson();
    }

    private boolean isBlankWorkflow(String json) {
        try {
            Map<String, Object> parsed = new com.fasterxml.jackson.databind.ObjectMapper().readValue(json, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
            Object nodesObj = parsed.get("nodes");
            if (nodesObj instanceof List<?> list) {
                return list.isEmpty();
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public String buildProgressWorkflowJson(String styleNo) {
        List<Map<String, Object>> nodes = templateLibraryService.resolveProgressNodeUnitPrices(styleNo);
        if (nodes == null || nodes.isEmpty()) return null;

        List<Map<String, Object>> normalizedNodes = new ArrayList<>();
        for (Map<String, Object> item : nodes) {
            if (item == null) continue;
            String processName = item.get("name") == null ? null : String.valueOf(item.get("name")).trim();
            if (!StringUtils.hasText(processName)) continue;

            Map<String, Object> node = new LinkedHashMap<>();
            String processCode = item.get("id") == null ? null : String.valueOf(item.get("id")).trim();
            if (StringUtils.hasText(processCode)) {
                node.put("id", processCode);
                node.put("processCode", processCode);
            }
            node.put("name", processName);

            String progressStage = item.get("progressStage") == null ? null : String.valueOf(item.get("progressStage")).trim();
            if (!StringUtils.hasText(progressStage) || progressStage.equals(processName)) {
                progressStage = resolveProgressStageFromMapping(processName);
            }
            if (StringUtils.hasText(progressStage)) {
                node.put("progressStage", progressStage);
            }

            BigDecimal unitPrice = BigDecimal.ZERO;
            Object unitPriceObj = item.get("unitPrice");
            if (unitPriceObj instanceof BigDecimal decimal) {
                unitPrice = decimal;
            } else if (unitPriceObj != null) {
                try { unitPrice = new BigDecimal(String.valueOf(unitPriceObj)); } catch (Exception ignore) { unitPrice = BigDecimal.ZERO; }
            }
            node.put("unitPrice", unitPrice);
            normalizedNodes.add(node);
        }

        if (normalizedNodes.isEmpty()) return null;

        Map<String, Object> workflow = new LinkedHashMap<>();
        workflow.put("nodes", normalizedNodes);
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(workflow);
        } catch (Exception ex) {
            log.warn("构建 progressWorkflowJson 失败", ex);
            return null;
        }
    }

    public String buildCuttingDefaultWorkflowJson() {
        List<Map<String, Object>> nodes = new ArrayList<>();
        String[][] defaults = {
            {"01", "裁剪", "裁剪"},
            {"02", "整件", "车缝"},
            {"03", "尾部", "尾部"}
        };
        for (String[] d : defaults) {
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("id", d[0]);
            node.put("name", d[1]);
            node.put("processCode", d[0]);
            node.put("progressStage", d[2]);
            node.put("unitPrice", BigDecimal.ZERO);
            nodes.add(node);
        }
        Map<String, Object> workflow = new LinkedHashMap<>();
        workflow.put("nodes", nodes);
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(workflow);
        } catch (Exception ex) {
            log.warn("构建裁剪默认工序模板失败", ex);
            return null;
        }
    }

    private String getTrimmedText(Map<String, Object> body, String key) {
        if (body == null || key == null) return null;
        Object v = body.get(key);
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return StringUtils.hasText(s) ? s : null;
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
