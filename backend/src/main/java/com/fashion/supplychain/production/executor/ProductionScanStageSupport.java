package com.fashion.supplychain.production.executor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.helper.ProcessStageDetector;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
@Slf4j
public class ProductionScanStageSupport {

    private static final String[] FIXED_PRODUCTION_NODES = {
            "采购", "裁剪", "二次工艺", "车缝", "尾部", "入库"
    };

    private static final Map<String, String> STAGE_KEY_TO_PARENT = new LinkedHashMap<>();

    static {
        STAGE_KEY_TO_PARENT.put("procurement", "采购");
        STAGE_KEY_TO_PARENT.put("cutting", "裁剪");
        STAGE_KEY_TO_PARENT.put("secondaryProcess", "二次工艺");
        STAGE_KEY_TO_PARENT.put("carSewing", "车缝");
        STAGE_KEY_TO_PARENT.put("tailProcess", "尾部");
        STAGE_KEY_TO_PARENT.put("warehousing", "入库");
    }

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ProcessParentMappingService processParentMappingService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private StyleAttachmentService styleAttachmentService;

    @Autowired
    private ProcessStageDetector processStageDetector;

    private final ObjectMapper objectMapper = new ObjectMapper();

    public String normalizeFixedProductionNodeName(String name) {
        return processStageDetector.normalizeFixedProductionNodeName(name);
    }

    private static final java.time.LocalDateTime GATE_EFFECTIVE_DATE = java.time.LocalDateTime.of(2026, 4, 1, 0, 0);

    public void validateParentStagePrerequisite(ProductionOrder order, CuttingBundle bundle,
                                                String progressStage, String childProcessName) {
        if (order == null) {
            return;
        }

        // 历史订单兼容：创建时间早于门禁生效日期的订单跳过门禁校验
        if (order.getCreateTime() != null && order.getCreateTime().isBefore(GATE_EFFECTIVE_DATE)) {
            log.debug("历史订单跳过子工序门禁: orderNo={}, createTime={}", order.getOrderNo(), order.getCreateTime());
            return;
        }

        // 管理员跳过门禁校验
        com.fashion.supplychain.common.UserContext ctx = com.fashion.supplychain.common.UserContext.get();
        if (ctx != null) {
            String role = ctx.getRole();
            if (role != null && (role.contains("admin") || role.contains("ADMIN") || role.contains("manager") || role.contains("supervisor") || role.contains("主管") || role.contains("管理员"))) {
                log.debug("管理员跳过子工序门禁: orderNo={}, role={}", order.getOrderNo(), role);
                return;
            }
        }

        String targetParent = normalizeFixedProductionNodeName(progressStage);
        int currentIdx = indexOfFixedNode(targetParent);
        if (currentIdx <= 0) {
            return;
        }

        String prevParent = FIXED_PRODUCTION_NODES[currentIdx - 1];
        Map<String, Set<String>> requiredByParent = resolveRequiredProcessesByParent(order);
        Set<String> required = requiredByParent.getOrDefault(prevParent, new LinkedHashSet<>());
        if (required.isEmpty()) {
            return;
        }

        List<String> missing = new ArrayList<>();
        String bundleId = (bundle != null && StringUtils.hasText(bundle.getId())) ? bundle.getId() : null;
        QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                .select("DISTINCT process_code")
                .eq("order_id", order.getId());
        if (bundleId != null) {
            qw.and(bw -> bw.isNull("cutting_bundle_id")
                    .or().eq("cutting_bundle_id", bundleId));
        }
        qw.in("scan_type", java.util.Arrays.asList("production", "cutting", "quality"))
                .eq("scan_result", "success")
                .isNotNull("process_code");
        List<Map<String, Object>> codeResult = scanRecordService.listMaps(qw);
        java.util.Set<String> completedProcesses = new java.util.HashSet<>();
        if (codeResult != null) {
            for (Map<String, Object> row : codeResult) {
                Object val = row.get("process_code");
                if (val != null) completedProcesses.add(val.toString().trim());
            }
        }
        QueryWrapper<ScanRecord> qw2 = new QueryWrapper<ScanRecord>()
                .select("DISTINCT process_name")
                .eq("order_id", order.getId());
        if (bundleId != null) {
            qw2.and(bw -> bw.isNull("cutting_bundle_id")
                    .or().eq("cutting_bundle_id", bundleId));
        }
        qw2.in("scan_type", java.util.Arrays.asList("production", "cutting", "quality"))
                .eq("scan_result", "success")
                .isNotNull("process_name");
        List<Map<String, Object>> nameResult = scanRecordService.listMaps(qw2);
        if (nameResult != null) {
            for (Map<String, Object> row : nameResult) {
                Object val = row.get("process_name");
                if (val != null) completedProcesses.add(val.toString().trim());
            }
        }
        for (String process : required) {
            if (!completedProcesses.contains(process)) {
                missing.add(process);
            }
        }

        if (!missing.isEmpty()) {
            throw new IllegalStateException(String.format(
                    "温馨提示：%s父节点还有子工序未完成（%s），暂不能进入%s",
                    prevParent,
                    String.join("、", missing),
                    targetParent
            ));
        }
        log.debug("父节点顺序校验通过: orderNo={}, bundleNo={}, targetParent={}, prevParent={}, process={}",
                order.getOrderNo(), bundle != null ? bundle.getBundleNo() : "无菲号", targetParent, prevParent, childProcessName);
    }

    public String resolveParentProgressStage(String styleNo, String processName) {
        if (!StringUtils.hasText(styleNo) || !StringUtils.hasText(processName)) {
            return null;
        }
        if (isFixedNode(processName)) {
            return null;
        }
        try {
            List<Map<String, Object>> nodes = templateLibraryService.resolveProgressNodeUnitPrices(styleNo.trim());
            if (nodes != null && !nodes.isEmpty()) {
                for (Map<String, Object> item : nodes) {
                    String name = item.get("name") != null ? item.get("name").toString().trim() : "";
                    String pStage = item.get("progressStage") != null ? item.get("progressStage").toString().trim() : "";

                    if (!StringUtils.hasText(name) || !name.equals(processName.trim())) {
                        continue;
                    }

                    if (StringUtils.hasText(pStage) && isFixedNode(pStage)) {
                        return pStage;
                    }
                    if (StringUtils.hasText(pStage) && !pStage.equals(name)) {
                        String normalizedParent = normalizeFixedProductionNodeName(pStage);
                        if (normalizedParent != null && isFixedNode(normalizedParent)) {
                            return normalizedParent;
                        }
                        String mapped = processParentMappingService.resolveParentNode(pStage);
                        if (mapped != null) {
                            return mapped;
                        }
                    }
                    break;
                }
            }
        } catch (Exception e) {
            log.warn("解析父进度节点失败: styleNo={}, processName={}", styleNo, processName, e);
        }

        String dynamicParent = processParentMappingService.resolveParentNode(processName);
        if (dynamicParent != null) {
            log.info("工序 '{}' 通过动态映射表 → 父节点 '{}' (styleNo={})", processName, dynamicParent, styleNo);
            return dynamicParent;
        }
        return null;
    }

    public void checkPatternForCutting(ProductionOrder order) {
        if (order == null || !StringUtils.hasText(order.getStyleId())) {
            return;
        }
        log.debug("检查版型文件: styleId={}", order.getStyleId());

        List<StyleAttachment> patterns;
        try {
            patterns = styleAttachmentService.list(
                    new LambdaQueryWrapper<StyleAttachment>()
                            .eq(StyleAttachment::getStyleId, order.getStyleId())
                            .in(StyleAttachment::getBizType,
                                    "pattern", "pattern_grading", "pattern_final")
                            .eq(StyleAttachment::getStatus, "active"));
        } catch (Exception e) {
            log.warn("查询版型文件失败，跳过版型校验: styleId={}", order.getStyleId(), e);
            return;
        }

        if (patterns == null || patterns.isEmpty()) {
            log.warn("裁剪前检查失败：款式 {} (ID:{}) 缺少版型文件",
                    order.getStyleNo(), order.getStyleId());
            throw new IllegalStateException(
                    String.format("裁剪前必须上传版型文件，款式编号：%s", order.getStyleNo())
            );
        }

        log.info("版型文件检查通过：款式 {} 共有 {} 个版型文件",
                order.getStyleNo(), patterns.size());
    }

    public BigDecimal resolveUnitPriceFromTemplate(String styleNo, String processName) {
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        String pn = StringUtils.hasText(processName) ? processName.trim() : null;
        if (!StringUtils.hasText(sn) || !StringUtils.hasText(pn)) {
            return null;
        }

        try {
            Map<String, BigDecimal> prices = templateLibraryService.resolveProcessUnitPrices(sn);
            if (prices == null || prices.isEmpty()) {
                return null;
            }

            String normalized = normalizeFixedProductionNodeName(pn);
            if (StringUtils.hasText(normalized)) {
                BigDecimal exact = prices.get(normalized);
                if (exact != null && exact.compareTo(BigDecimal.ZERO) > 0) {
                    return exact;
                }
            }

            BigDecimal exact = prices.get(pn);
            if (exact != null && exact.compareTo(BigDecimal.ZERO) > 0) {
                return exact;
            }

            for (String n : FIXED_PRODUCTION_NODES) {
                if (!StringUtils.hasText(n)) {
                    continue;
                }
                if (templateLibraryService.progressStageNameMatches(n, pn)) {
                    BigDecimal v = prices.get(n);
                    if (v != null && v.compareTo(BigDecimal.ZERO) > 0) {
                        return v;
                    }
                }
            }

            for (Map.Entry<String, BigDecimal> e : prices.entrySet()) {
                if (e == null) {
                    continue;
                }
                String k = e.getKey();
                if (!StringUtils.hasText(k)) {
                    continue;
                }
                if (templateLibraryService.progressStageNameMatches(k, pn)) {
                    BigDecimal v = e.getValue();
                    return v == null ? null : v;
                }
            }
        } catch (Exception e) {
            log.warn("解析单价失败: styleNo={}, processName={}", sn, pn, e);
        }

        return null;
    }

    private int indexOfFixedNode(String name) {
        if (!StringUtils.hasText(name)) return -1;
        String n = normalizeFixedProductionNodeName(name);
        for (int i = 0; i < FIXED_PRODUCTION_NODES.length; i++) {
            if (FIXED_PRODUCTION_NODES[i].equals(n)) {
                return i;
            }
        }
        return -1;
    }

    private boolean isFixedNode(String name) {
        if (!StringUtils.hasText(name)) return false;
        String n = name.trim();
        for (String node : FIXED_PRODUCTION_NODES) {
            if (node.equals(n)) return true;
        }
        return false;
    }

    private Map<String, Set<String>> resolveRequiredProcessesByParent(ProductionOrder order) {
        Map<String, Set<String>> result = new LinkedHashMap<>();
        for (String fixedNode : FIXED_PRODUCTION_NODES) {
            result.put(fixedNode, new LinkedHashSet<>());
        }
        if (order == null) {
            return result;
        }

        try {
            if (StringUtils.hasText(order.getStyleNo())) {
                List<Map<String, Object>> templateNodes = templateLibraryService.resolveProgressNodeUnitPrices(order.getStyleNo().trim());
                if (templateNodes != null) {
                    for (Map<String, Object> node : templateNodes) {
                        String processName = node.get("name") == null ? "" : String.valueOf(node.get("name")).trim();
                        String parent = node.get("progressStage") == null ? "" : String.valueOf(node.get("progressStage")).trim();
                        String normalizedParent = normalizeFixedProductionNodeName(parent);
                        if (!StringUtils.hasText(processName) || !isFixedNode(normalizedParent)) {
                            continue;
                        }
                        result.get(normalizedParent).add(processName);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("解析模板子工序失败，回退默认门禁逻辑: orderNo={}", order.getOrderNo(), e);
        }

        applySubProcessRemap(order, result);
        return result;
    }

    @SuppressWarnings("unchecked")
    private void applySubProcessRemap(ProductionOrder order, Map<String, Set<String>> requiredByParent) {
        if (order == null || !StringUtils.hasText(order.getNodeOperations()) || requiredByParent == null || requiredByParent.isEmpty()) {
            return;
        }
        try {
            Map<String, Object> root = objectMapper.readValue(order.getNodeOperations(), new TypeReference<Map<String, Object>>() {});
            Object remapObj = root.get("subProcessRemap");
            if (!(remapObj instanceof Map)) {
                return;
            }
            Map<String, Object> remap = (Map<String, Object>) remapObj;
            for (Map.Entry<String, Object> entry : remap.entrySet()) {
                String stageKey = entry.getKey();
                String parent = STAGE_KEY_TO_PARENT.get(stageKey);
                if (!isFixedNode(parent) || !(entry.getValue() instanceof Map)) {
                    continue;
                }
                Map<String, Object> stageCfg = (Map<String, Object>) entry.getValue();
                boolean enabled = Boolean.TRUE.equals(stageCfg.get("enabled"));
                if (!enabled) {
                    continue;
                }
                Object subProcessesObj = stageCfg.get("subProcesses");
                if (!(subProcessesObj instanceof List)) {
                    continue;
                }
                List<Object> subProcesses = (List<Object>) subProcessesObj;
                LinkedHashSet<String> names = new LinkedHashSet<>();
                for (Object item : subProcesses) {
                    if (!(item instanceof Map)) continue;
                    String name = ((Map<String, Object>) item).get("name") == null
                            ? ""
                            : String.valueOf(((Map<String, Object>) item).get("name")).trim();
                    if (StringUtils.hasText(name)) {
                        names.add(name);
                    }
                }
                if (!names.isEmpty()) {
                    requiredByParent.put(parent, names);
                }
            }
        } catch (Exception e) {
            log.warn("解析subProcessRemap失败，忽略重映射: orderNo={}", order.getOrderNo(), e);
        }
    }
}
