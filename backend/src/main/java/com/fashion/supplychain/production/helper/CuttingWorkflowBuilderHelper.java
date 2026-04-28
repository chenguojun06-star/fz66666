package com.fashion.supplychain.production.helper;

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

    private final TemplateLibraryService templateLibraryService;

    public CuttingWorkflowBuilderHelper(TemplateLibraryService templateLibraryService) {
        this.templateLibraryService = templateLibraryService;
    }

    public String resolveProgressWorkflowJson(Map<String, Object> body, String styleNo) {
        String progressWorkflowJson = getTrimmedText(body, "progressWorkflowJson");
        if (!StringUtils.hasText(progressWorkflowJson)) {
            progressWorkflowJson = buildProgressWorkflowJson(styleNo);
        }
        if (!StringUtils.hasText(progressWorkflowJson)) {
            progressWorkflowJson = buildCuttingDefaultWorkflowJson();
        }
        return progressWorkflowJson;
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
}
