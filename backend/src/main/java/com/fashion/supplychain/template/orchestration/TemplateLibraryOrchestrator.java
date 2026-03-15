package com.fashion.supplychain.template.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.entity.TemplateOperationLog;
import com.fashion.supplychain.template.event.TemplatePriceChangedEvent;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fashion.supplychain.template.service.TemplateOperationLogService;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class TemplateLibraryOrchestrator {

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private TemplateOperationLogService templateOperationLogService;

    @Autowired
    private TemplateStyleOrchestrator templateStyleOrchestrator;

    @Autowired
    private com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @Autowired
    private ApplicationEventPublisher eventPublisher;

    @Autowired
    private ObjectMapper objectMapper;

    public IPage<TemplateLibrary> list(Map<String, Object> params) {
        IPage<TemplateLibrary> pageResult = templateLibraryService.queryPage(params);
        // 补充来源款式封面图
        List<String> styleNos = pageResult.getRecords().stream()
            .map(TemplateLibrary::getSourceStyleNo)
            .filter(sn -> sn != null && !sn.isBlank())
            .distinct()
            .collect(java.util.stream.Collectors.toList());
        if (!styleNos.isEmpty()) {
            List<StyleInfo> styles = styleInfoService.list(
                new LambdaQueryWrapper<StyleInfo>().in(StyleInfo::getStyleNo, styleNos)
            );
            Map<String, String> coverMap = styles.stream()
                .filter(s -> StringUtils.hasText(s.getStyleNo()))
                .collect(java.util.stream.Collectors.toMap(
                    StyleInfo::getStyleNo,
                    s -> s.getCover() != null ? s.getCover() : "",
                    (a, b) -> a));
            pageResult.getRecords().forEach(r -> {
                if (StringUtils.hasText(r.getSourceStyleNo())) {
                    String cover = coverMap.get(r.getSourceStyleNo());
                    if (StringUtils.hasText(cover)) {
                        r.setStyleCoverUrl(cover);
                    } else {
                        r.setStyleCoverUrl(extractFirstTemplateImage(r.getTemplateContent()));
                    }
                }
            });
        }
        return pageResult;
    }

    public List<TemplateLibrary> listByType(String templateType) {
        return templateLibraryService.listByType(templateType);
    }

    public TemplateLibrary detail(String id) {
        TemplateLibrary tpl = templateLibraryService.getById(id);
        if (tpl == null) {
            throw new NoSuchElementException("模板不存在");
        }
        return tpl;
    }

    public Map<String, BigDecimal> resolveProcessUnitPrices(String styleNo) {
        String sn = String.valueOf(styleNo == null ? "" : styleNo).trim();
        if (!StringUtils.hasText(sn)) {
            throw new IllegalArgumentException("styleNo不能为空");
        }
        return templateLibraryService.resolveProcessUnitPrices(sn);
    }

    public List<Map<String, Object>> resolveProgressNodeUnitPrices(String styleNo) {
        String sn = String.valueOf(styleNo == null ? "" : styleNo).trim();
        if (!StringUtils.hasText(sn)) {
            throw new IllegalArgumentException("styleNo不能为空");
        }
        return templateLibraryService.resolveProgressNodeUnitPrices(sn);
    }

    public Map<String, Object> getProcessPriceTemplate(String styleNo) {
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        TemplateLibrary matched = StringUtils.hasText(sn) ? findStyleScopedProcessPriceTemplate(sn) : null;

        String matchedScope = "empty";
        if (matched != null) {
            matchedScope = "style";
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("exists", matched != null);
        result.put("requestedStyleNo", sn);
        result.put("matchedScope", matchedScope);
        result.put("templateId", matched == null ? null : matched.getId());
        result.put("templateKey", matched == null ? null : matched.getTemplateKey());
        result.put("templateName", matched == null ? null : matched.getTemplateName());
        result.put("sourceStyleNo", matched == null ? null : matched.getSourceStyleNo());
        result.put("content", parseProcessPriceTemplateContent(matched == null ? null : matched.getTemplateContent()));
        return result;
    }

    public List<Map<String, Object>> listProcessPriceStyleOptions(String keyword) {
        String keywordText = StringUtils.hasText(keyword) ? keyword.trim() : null;
        Map<String, Map<String, Object>> merged = new LinkedHashMap<>();

        List<StyleInfo> styleInfos = styleInfoService.list(new LambdaQueryWrapper<StyleInfo>()
                .like(StringUtils.hasText(keywordText), StyleInfo::getStyleNo, keywordText)
                .orderByDesc(StyleInfo::getUpdateTime)
                .orderByDesc(StyleInfo::getCreateTime)
                .last("limit 30"));
        for (StyleInfo styleInfo : styleInfos) {
            String styleNo = styleInfo == null ? null : String.valueOf(styleInfo.getStyleNo() == null ? "" : styleInfo.getStyleNo()).trim();
            if (!StringUtils.hasText(styleNo) || merged.containsKey(styleNo)) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("styleNo", styleNo);
            item.put("styleName", StringUtils.hasText(styleInfo.getStyleName()) ? styleInfo.getStyleName().trim() : null);
            item.put("source", "style_info");
            merged.put(styleNo, item);
        }

        List<TemplateLibrary> templates = templateLibraryService.list(new LambdaQueryWrapper<TemplateLibrary>()
                .eq(TemplateLibrary::getTemplateType, "process_price")
                .isNotNull(TemplateLibrary::getSourceStyleNo)
                .ne(TemplateLibrary::getSourceStyleNo, "")
                .like(StringUtils.hasText(keywordText), TemplateLibrary::getSourceStyleNo, keywordText)
                .orderByDesc(TemplateLibrary::getUpdateTime)
                .orderByDesc(TemplateLibrary::getCreateTime)
                .last("limit 50"));
        for (TemplateLibrary template : templates) {
            String styleNo = template == null ? null : String.valueOf(template.getSourceStyleNo() == null ? "" : template.getSourceStyleNo()).trim();
            if (!StringUtils.hasText(styleNo) || merged.containsKey(styleNo)) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("styleNo", styleNo);
            item.put("styleName", null);
            item.put("source", "process_price_template");
            merged.put(styleNo, item);
        }

        return new ArrayList<>(merged.values());
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> saveProcessPriceTemplate(Map<String, Object> body) {
        Map<String, Object> payload = body == null ? Map.of() : body;
        String styleNo = String.valueOf(payload.getOrDefault("styleNo", "")).trim();
        if (!StringUtils.hasText(styleNo)) {
            throw new IllegalArgumentException("styleNo不能为空");
        }

        Map<String, Object> content = coerceMap(payload.get("templateContent"));
        List<Map<String, Object>> rawSteps = coerceListOfMap(content.get("steps"));
        if (rawSteps.isEmpty()) {
            throw new IllegalArgumentException("请至少配置一条工序单价");
        }

        List<Map<String, Object>> normalizedSteps = new ArrayList<>();
        int index = 1;
        for (Map<String, Object> rawStep : rawSteps) {
            String processName = String.valueOf(rawStep.getOrDefault("processName", rawStep.getOrDefault("name", ""))).trim();
            if (!StringUtils.hasText(processName)) {
                continue;
            }

            Map<String, Object> step = new LinkedHashMap<>();
            String processCode = String.valueOf(rawStep.getOrDefault("processCode", "")).trim();
            step.put("processCode", StringUtils.hasText(processCode) ? processCode : String.format("%02d", index));
            step.put("processName", processName);

            String progressStage = String.valueOf(rawStep.getOrDefault("progressStage", "")).trim();
            if (StringUtils.hasText(progressStage)) {
                step.put("progressStage", progressStage);
            }

            String machineType = String.valueOf(rawStep.getOrDefault("machineType", "")).trim();
            if (StringUtils.hasText(machineType)) {
                step.put("machineType", machineType);
            }

            String difficulty = String.valueOf(rawStep.getOrDefault("difficulty", "")).trim();
            if (StringUtils.hasText(difficulty)) {
                step.put("difficulty", difficulty);
            }

            Object standardTimeValue = rawStep.get("standardTime");
            Integer standardTime = null;
            if (standardTimeValue instanceof Number number) {
                standardTime = number.intValue();
            } else if (standardTimeValue != null) {
                try {
                    standardTime = Integer.parseInt(String.valueOf(standardTimeValue).trim());
                } catch (Exception ignore) {
                    standardTime = null;
                }
            }
            if (standardTime != null && standardTime >= 0) {
                step.put("standardTime", standardTime);
            }

            BigDecimal unitPrice = toBigDecimal(rawStep.containsKey("unitPrice") ? rawStep.get("unitPrice") : rawStep.get("price"));
            step.put("unitPrice", unitPrice == null ? BigDecimal.ZERO : unitPrice.max(BigDecimal.ZERO));

            Map<String, Object> rawSizePrices = coerceMap(rawStep.get("sizePrices"));
            if (!rawSizePrices.isEmpty()) {
                Map<String, Object> sizePrices = new LinkedHashMap<>();
                for (Map.Entry<String, Object> entry : rawSizePrices.entrySet()) {
                    String key = String.valueOf(entry.getKey() == null ? "" : entry.getKey()).trim();
                    if (!StringUtils.hasText(key)) {
                        continue;
                    }
                    BigDecimal price = toBigDecimal(entry.getValue());
                    sizePrices.put(key, price == null ? BigDecimal.ZERO : price.max(BigDecimal.ZERO));
                }
                if (!sizePrices.isEmpty()) {
                    step.put("sizePrices", sizePrices);
                }
            }

            normalizedSteps.add(step);
            index++;
        }

        if (normalizedSteps.isEmpty()) {
            throw new IllegalArgumentException("请至少填写一条有效工序");
        }

        List<String> sizes = coerceListOfString(content.get("sizes"));
        List<String> images = coerceListOfString(content.get("images"));
        Map<String, Object> normalizedContent = new LinkedHashMap<>();
        normalizedContent.put("steps", normalizedSteps);
        if (!sizes.isEmpty()) {
            normalizedContent.put("sizes", sizes);
        }
        if (!images.isEmpty()) {
            normalizedContent.put("images", images);
        }

        String normalizedStyleNo = styleNo;
        String templateName = String.valueOf(payload.getOrDefault("templateName", "")).trim();
        if (!StringUtils.hasText(templateName)) {
            templateName = normalizedStyleNo + "-工序单价模板";
        }

        TemplateLibrary template = new TemplateLibrary();
        template.setTemplateType("process_price");
        template.setTemplateKey("style_" + normalizedStyleNo);
        template.setTemplateName(templateName);
        template.setSourceStyleNo(normalizedStyleNo);
        try {
            template.setTemplateContent(objectMapper.writeValueAsString(normalizedContent));
        } catch (Exception e) {
            throw new IllegalStateException("工序单价模板序列化失败");
        }
        template.setLocked(1);
        template.setOperatorName(UserContext.username());

        boolean ok = templateLibraryService.upsertTemplate(template);
        if (!ok) {
            throw new IllegalStateException("保存工序单价模板失败");
        }

        return getProcessPriceTemplate(normalizedStyleNo);
    }

    public TemplateLibrary create(TemplateLibrary tpl) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        if (tpl == null) {
            throw new IllegalArgumentException("参数不能为空");
        }

        String type = String.valueOf(tpl.getTemplateType() == null ? "" : tpl.getTemplateType()).trim().toLowerCase();
        String key = String.valueOf(tpl.getTemplateKey() == null ? "" : tpl.getTemplateKey()).trim();
        String name = String.valueOf(tpl.getTemplateName() == null ? "" : tpl.getTemplateName()).trim();
        String content = String.valueOf(tpl.getTemplateContent() == null ? "" : tpl.getTemplateContent()).trim();
        String ssn = String.valueOf(tpl.getSourceStyleNo() == null ? "" : tpl.getSourceStyleNo()).trim();

        if (!StringUtils.hasText(type)) {
            throw new IllegalArgumentException("templateType不能为空");
        }
        if (!List.of("bom", "size", "process").contains(type)) {
            throw new IllegalArgumentException("不支持的模板类型");
        }
        if (!StringUtils.hasText(name)) {
            throw new IllegalArgumentException("templateName不能为空");
        }
        if (!StringUtils.hasText(content)) {
            throw new IllegalArgumentException("templateContent不能为空");
        }

        if (!StringUtils.hasText(key)) {
            key = "custom_" + UUID.randomUUID().toString().replace("-", "");
        }

        TemplateLibrary existing = templateLibraryService.getOne(new LambdaQueryWrapper<TemplateLibrary>()
                .eq(TemplateLibrary::getTemplateType, type)
                .eq(TemplateLibrary::getTemplateKey, key)
                .last("LIMIT 1"));
        if (existing != null) {
            key = key + "_" + String.valueOf(System.currentTimeMillis());
        }

        LocalDateTime now = LocalDateTime.now();
        String operator = UserContext.username();

        TemplateLibrary created = new TemplateLibrary();
        created.setId(UUID.randomUUID().toString());
        created.setTemplateType(type);
        created.setTemplateKey(key);
        created.setTemplateName(name);
        created.setSourceStyleNo(StringUtils.hasText(ssn) ? ssn : null);
        created.setTemplateContent(content);
        created.setLocked(1);
        created.setOperatorName(operator);
        created.setCreateTime(now);
        created.setUpdateTime(now);

        boolean ok = templateLibraryService.save(created);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        // 发布价格变更事件，触发向下同步（报价单 + 订单工序 + 工序跟踪）
        if ("process".equalsIgnoreCase(type)) {
            try {
                eventPublisher.publishEvent(new TemplatePriceChangedEvent(
                    this,
                    StringUtils.hasText(ssn) ? ssn : null,
                    type,
                    UserContext.username()
                ));
                log.info("[价格变更事件] 已发布工序模板创建事件 - styleNo: {}", ssn);
            } catch (Exception e) {
                log.warn("[价格变更事件] 发布失败 - styleNo: {}", ssn, e);
            }
        }

        return created;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean save(TemplateLibrary tpl) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        if (tpl == null) {
            throw new IllegalArgumentException("参数错误");
        }

        String type = String.valueOf(tpl.getTemplateType() == null ? "" : tpl.getTemplateType()).trim().toLowerCase();
        String key = String.valueOf(tpl.getTemplateKey() == null ? "" : tpl.getTemplateKey()).trim();
        String name = String.valueOf(tpl.getTemplateName() == null ? "" : tpl.getTemplateName()).trim();
        String content = String.valueOf(tpl.getTemplateContent() == null ? "" : tpl.getTemplateContent()).trim();
        if (!StringUtils.hasText(type) || !StringUtils.hasText(key) || !StringUtils.hasText(name)
                || !StringUtils.hasText(content)) {
            throw new IllegalArgumentException("模板参数不完整");
        }

        // 检查是否已存在相同 type+key 的记录
        TemplateLibrary existing = templateLibraryService.lambdaQuery()
                .eq(TemplateLibrary::getTemplateType, type)
                .eq(TemplateLibrary::getTemplateKey, key)
                .one();

        LocalDateTime now = LocalDateTime.now();

        if (existing != null) {
            // 如果已存在，执行更新
            existing.setTemplateName(name);
            existing.setTemplateContent(content);
            existing.setLocked(1);
            String ssn = String.valueOf(tpl.getSourceStyleNo() == null ? "" : tpl.getSourceStyleNo()).trim();
            existing.setSourceStyleNo(StringUtils.hasText(ssn) ? ssn : null);
            existing.setOperatorName(UserContext.username());
            existing.setUpdateTime(now);
            boolean ok = templateLibraryService.updateById(existing);
            if (!ok) {
                throw new IllegalStateException("更新失败");
            }
        } else {
            // 如果不存在，执行新建
            tpl.setTemplateType(type);
            tpl.setTemplateKey(key);
            tpl.setTemplateName(name);
            tpl.setTemplateContent(content);
            tpl.setLocked(1);
            String ssn = String.valueOf(tpl.getSourceStyleNo() == null ? "" : tpl.getSourceStyleNo()).trim();
            tpl.setSourceStyleNo(StringUtils.hasText(ssn) ? ssn : null);
            tpl.setOperatorName(UserContext.username());
            if (tpl.getCreateTime() == null) {
                tpl.setCreateTime(now);
            }
            tpl.setUpdateTime(now);
            boolean ok = templateLibraryService.save(tpl);
            if (!ok) {
                throw new IllegalStateException("保存失败");
            }
        }

        // 发布价格变更事件（如果是工序模板）
        if ("process".equalsIgnoreCase(type)) {
            String ssn = String.valueOf(tpl.getSourceStyleNo() == null ? "" : tpl.getSourceStyleNo()).trim();
            try {
                eventPublisher.publishEvent(new TemplatePriceChangedEvent(
                    this,
                    StringUtils.hasText(ssn) ? ssn : null,
                    type,
                    UserContext.username()
                ));
                log.info("[价格变更事件] 已发布工序模板价格变更事件 - styleNo: {}, operator: {}", ssn, UserContext.username());
            } catch (Exception e) {
                log.warn("[价格变更事件] 发布失败 - styleNo: {}", ssn, e);
            }
        }

        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean update(TemplateLibrary tpl) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        if (tpl == null || !StringUtils.hasText(String.valueOf(tpl.getId() == null ? "" : tpl.getId()).trim())) {
            throw new IllegalArgumentException("id不能为空");
        }

        TemplateLibrary current = templateLibraryService.getById(String.valueOf(tpl.getId()));
        if (current == null) {
            throw new NoSuchElementException("模板不存在");
        }
        // 混合表：租户私有模板需校验归属，系统共享模板(tenantId=null)由TopAdmin权限保护
        if (current.getTenantId() != null) {
            TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "模板");
        }

        String previousName = String.valueOf(current.getTemplateName() == null ? "" : current.getTemplateName()).trim();
        String previousContent = String
                .valueOf(current.getTemplateContent() == null ? "" : current.getTemplateContent()).trim();

        if (isLocked(current)) {
            throw new IllegalStateException("模板已锁定，仅管理员可退回后修改");
        }

        String type = String.valueOf(tpl.getTemplateType() == null ? current.getTemplateType() : tpl.getTemplateType())
                .trim().toLowerCase();
        String key = String.valueOf(tpl.getTemplateKey() == null ? current.getTemplateKey() : tpl.getTemplateKey())
                .trim();
        String name = String.valueOf(tpl.getTemplateName() == null ? current.getTemplateName() : tpl.getTemplateName())
                .trim();
        String content = String
                .valueOf(tpl.getTemplateContent() == null ? current.getTemplateContent() : tpl.getTemplateContent())
                .trim();

        if (!StringUtils.hasText(type) || !StringUtils.hasText(key) || !StringUtils.hasText(name)
                || !StringUtils.hasText(content)) {
            throw new IllegalArgumentException("模板参数不完整");
        }

        current.setTemplateType(type);
        current.setTemplateKey(key);
        current.setTemplateName(name);
        current.setTemplateContent(content);
        String ssn = String
                .valueOf(tpl.getSourceStyleNo() == null ? current.getSourceStyleNo() : tpl.getSourceStyleNo()).trim();
        current.setSourceStyleNo(StringUtils.hasText(ssn) ? ssn : null);
        current.setLocked(1);
        current.setOperatorName(UserContext.username());
        current.setUpdateTime(LocalDateTime.now());
        boolean ok = templateLibraryService.updateById(current);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        boolean contentChanged = !previousContent.equals(content);
        if ("progress".equalsIgnoreCase(current.getTemplateType()) && StringUtils.hasText(ssn) && contentChanged) {
            try {
                productionOrderOrchestrator.recomputeProgressByStyleNo(ssn);
            } catch (Exception e) {
                log.warn("Failed to recompute progress by styleNo: styleNo={}, templateId={}", ssn, current.getId(), e);
            }
        }

        // 发布价格变更事件（如果是工序模板且内容变更）
        if ("process".equalsIgnoreCase(type) && contentChanged) {
            try {
                eventPublisher.publishEvent(new TemplatePriceChangedEvent(
                    this,
                    StringUtils.hasText(ssn) ? ssn : null,
                    type,
                    UserContext.username()
                ));
                log.info("[价格变更事件] 已发布工序模板价格变更事件 - styleNo: {}, operator: {}", ssn, UserContext.username());
            } catch (Exception e) {
                log.warn("[价格变更事件] 发布失败 - styleNo: {}", ssn, e);
            }
        }

        String newName = String.valueOf(name == null ? "" : name).trim();
        boolean nameChanged = !previousName.equals(newName);
        String groupKey = String.valueOf(key == null ? "" : key).trim();
        if (nameChanged && StringUtils.hasText(groupKey)) {
            String base = newName;
            for (String suffix : List.of("-BOM模板", "-尺码模板", "-工艺模板", "-工序单价模板", "-进度模板")) {
                if (base.endsWith(suffix)) {
                    base = base.substring(0, Math.max(0, base.length() - suffix.length()));
                    break;
                }
            }
            base = String.valueOf(base == null ? "" : base).trim();
            if (!StringUtils.hasText(base)) {
                base = newName;
            }
            List<TemplateLibrary> siblings = templateLibraryService.list(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<TemplateLibrary>()
                            .eq(TemplateLibrary::getTemplateKey, groupKey));
            LocalDateTime now = LocalDateTime.now();
            for (TemplateLibrary s : siblings) {
                if (s == null) {
                    continue;
                }
                String t = String.valueOf(s.getTemplateType() == null ? "" : s.getTemplateType()).trim().toLowerCase();
                String suffix = "";
                if ("bom".equals(t)) {
                    suffix = "-BOM模板";
                } else if ("size".equals(t)) {
                    suffix = "-尺码模板";
                } else if ("process".equals(t)) {
                    suffix = "-工艺模板";
                } else if ("process_price".equals(t)) {
                    suffix = "-工序单价模板";
                } else if ("progress".equals(t)) {
                    suffix = "-进度模板";
                }
                String targetName = suffix.isEmpty() ? base : base + suffix;
                s.setTemplateName(targetName);
                s.setUpdateTime(now);
                templateLibraryService.updateById(s);
            }
        }
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean rollback(String id, String reason) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        String tid = String.valueOf(id == null ? "" : id).trim();
        if (!StringUtils.hasText(tid)) {
            throw new IllegalArgumentException("id不能为空");
        }
        String remark = StringUtils.hasText(reason) ? reason.trim() : null;
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("reason不能为空");
        }
        TemplateLibrary current = templateLibraryService.getById(tid);
        if (current == null) {
            throw new NoSuchElementException("模板不存在");
        }
        // 混合表：租户私有模板需校验归属，系统共享模板(tenantId=null)由TopAdmin权限保护
        if (current.getTenantId() != null) {
            TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "模板");
        }
        if (!isLocked(current)) {
            return true;
        }
        current.setLocked(0);
        current.setUpdateTime(LocalDateTime.now());
        boolean ok = templateLibraryService.updateById(current);
        if (!ok) {
            throw new IllegalStateException("退回失败");
        }
        saveRollbackLog(tid, remark);
        return true;
    }

    private void saveRollbackLog(String templateId, String remark) {
        try {
            TemplateOperationLog log = new TemplateOperationLog();
            log.setTemplateId(templateId);
            log.setAction("ROLLBACK");
            UserContext ctx = UserContext.get();
            log.setOperator(ctx != null ? ctx.getUsername() : null);
            log.setRemark(remark);
            log.setCreateTime(LocalDateTime.now());
            templateOperationLogService.save(log);
        } catch (Exception e) {
            log.warn("Failed to save template rollback log: templateId={}", templateId, e);
        }
    }

    private static boolean isLocked(TemplateLibrary tpl) {
        if (tpl == null) {
            return false;
        }
        Integer v = tpl.getLocked();
        return v != null && v.intValue() == 1;
    }

    public boolean delete(String id) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        boolean ok = templateLibraryService.removeById(id);
        if (!ok) {
            if (templateLibraryService.getById(id) == null) {
                log.warn("[TEMPLATE-DELETE] id={} already deleted, idempotent success", id);
                return true;
            }
            throw new IllegalStateException("删除失败");
        }
        return true;
    }

    public List<TemplateLibrary> createFromStyle(Map<String, Object> body) {
        // 移除权限限制，工序模板应该允许所有有权限的用户创建
        // if (!UserContext.isTopAdmin()) {
        //     throw new AccessDeniedException("无权限操作");
        // }

        String sourceStyleNo = body == null ? null
                : (body.get("sourceStyleNo") == null ? null : String.valueOf(body.get("sourceStyleNo")));
        Object typesRaw = body == null ? null : body.get("templateTypes");
        List<String> types;
        if (typesRaw instanceof List<?> list) {
            types = list.stream().map(v -> v == null ? null : String.valueOf(v))
                    .collect(java.util.stream.Collectors.toList());
        } else {
            types = List.of();
        }
        List<TemplateLibrary> created = templateStyleOrchestrator.createTemplateFromStyle(sourceStyleNo, types);
        return created;
    }

    public boolean applyToStyle(Map<String, Object> body) {
        // 移除权限限制，工序模板应该允许所有有权限的用户使用
        // if (!UserContext.isTopAdmin()) {
        //     throw new AccessDeniedException("无权限操作");
        // }

        String templateId = body == null ? null
                : (body.get("templateId") == null ? null : String.valueOf(body.get("templateId")));
        Long targetStyleId = null;
        Object sid = body == null ? null : body.get("targetStyleId");
        if (sid != null) {
            try {
                targetStyleId = Long.parseLong(String.valueOf(sid));
            } catch (Exception e) {
                throw new IllegalArgumentException("targetStyleId参数错误");
            }
        }
        if (targetStyleId == null) {
            String targetStyleNo = body == null ? null
                    : (body.get("targetStyleNo") == null ? null : String.valueOf(body.get("targetStyleNo")));
            String sn = String.valueOf(targetStyleNo == null ? "" : targetStyleNo).trim();
            if (StringUtils.hasText(sn)) {
                StyleInfo style = styleInfoService.lambdaQuery().eq(StyleInfo::getStyleNo, sn).one();
                if (style != null && style.getId() != null) {
                    targetStyleId = style.getId();
                }
            }
        }
        String mode = body == null ? null : (body.get("mode") == null ? null : String.valueOf(body.get("mode")));
        boolean ok = templateStyleOrchestrator.applyTemplateToStyle(templateId, targetStyleId, mode);
        if (!ok) {
            throw new IllegalStateException("导入失败");
        }
        return true;
    }

    /**
     * 批量同步工序进度单价（反推生产订单）
     *
     * @param styleNo 款号
     * @return 同步结果摘要
     */
    public Map<String, Object> syncProcessUnitPricesByStyleNo(String styleNo) {
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : "";
        if (!StringUtils.hasText(sn)) {
            throw new IllegalArgumentException("款号不能为空");
        }
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getStyleNo, sn)
                .isNotNull(ProductionOrder::getStyleNo)
                .list();
        int totalOrders = orders.size();
        int successCount = 0;
        int totalSynced = 0;
        int workflowUpdatedOrders = 0;
        int workflowUpdatedNodes = 0;
        List<Map<String, Object>> details = new ArrayList<>();
        for (ProductionOrder order : orders) {
            int synced = 0;
            int workflowUpdated = 0;
            boolean touched = false;
            try {
                synced = processTrackingOrchestrator.syncUnitPrices(order.getId());
                if (synced > 0) {
                    totalSynced += synced;
                    touched = true;
                }
            } catch (Exception e) {
                log.warn("订单 {} 单价同步失败: {}", order.getOrderNo(), e.getMessage());
            }

            try {
                workflowUpdated = refreshOrderWorkflowPrices(order);
                if (workflowUpdated > 0) {
                    workflowUpdatedOrders++;
                    workflowUpdatedNodes += workflowUpdated;
                    touched = true;
                }
            } catch (Exception e) {
                log.warn("订单 {} 工序单价快照刷新失败: {}", order.getOrderNo(), e.getMessage());
            }

            if (touched) {
                successCount++;
            }
            Map<String, Object> d = new HashMap<>();
            d.put("orderNo", order.getOrderNo());
            d.put("styleNo", order.getStyleNo());
            d.put("syncedRecords", synced);
            d.put("workflowUpdatedNodes", workflowUpdated);
            details.add(d);
        }
        Map<String, Object> result = new HashMap<>();
        result.put("styleNo", sn);
        result.put("scopeLabel", "款号 " + sn);
        result.put("totalOrders", totalOrders);
        result.put("successOrders", successCount);
        result.put("totalSynced", totalSynced);
        result.put("workflowUpdatedOrders", workflowUpdatedOrders);
        result.put("workflowUpdatedNodes", workflowUpdatedNodes);
        result.put("details", details);
        return result;
    }

    private TemplateLibrary findStyleScopedProcessPriceTemplate(String styleNo) {
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        if (StringUtils.hasText(sn)) {
            return templateLibraryService.getOne(new LambdaQueryWrapper<TemplateLibrary>()
                    .eq(TemplateLibrary::getTemplateType, "process_price")
                    .eq(TemplateLibrary::getSourceStyleNo, sn)
                    .orderByDesc(TemplateLibrary::getUpdateTime)
                    .orderByDesc(TemplateLibrary::getCreateTime)
                    .last("limit 1"));
        }
        return null;
    }

    private Map<String, Object> parseProcessPriceTemplateContent(String rawJson) {
        Map<String, Object> content = new LinkedHashMap<>();
        List<Map<String, Object>> steps = new ArrayList<>();
        List<String> sizes = new ArrayList<>();
        List<String> images = new ArrayList<>();

        if (StringUtils.hasText(rawJson)) {
            try {
                Map<String, Object> raw = objectMapper.readValue(rawJson, new TypeReference<Map<String, Object>>() {});
                sizes.addAll(coerceListOfString(raw.get("sizes")));
                images.addAll(coerceListOfString(raw.get("images")));
                List<Map<String, Object>> items = coerceListOfMap(raw.get("steps"));
                if (items.isEmpty()) {
                    items = coerceListOfMap(raw.get("nodes"));
                }
                for (Map<String, Object> item : items) {
                    String processName = String.valueOf(item.getOrDefault("processName", item.getOrDefault("name", ""))).trim();
                    if (!StringUtils.hasText(processName)) {
                        continue;
                    }
                    Map<String, Object> step = new LinkedHashMap<>();
                    step.put("processCode", String.valueOf(item.getOrDefault("processCode", item.getOrDefault("id", ""))).trim());
                    step.put("processName", processName);
                    step.put("progressStage", String.valueOf(item.getOrDefault("progressStage", "")).trim());
                    step.put("machineType", String.valueOf(item.getOrDefault("machineType", "")).trim());
                    step.put("difficulty", String.valueOf(item.getOrDefault("difficulty", "")).trim());
                    step.put("standardTime", item.get("standardTime"));
                    step.put("unitPrice", item.containsKey("unitPrice") ? item.get("unitPrice") : item.get("price"));
                    Map<String, Object> sizePrices = coerceMap(item.get("sizePrices"));
                    if (!sizePrices.isEmpty()) {
                        step.put("sizePrices", sizePrices);
                    }
                    steps.add(step);
                }
            } catch (Exception e) {
                log.warn("解析工序单价模板内容失败");
            }
        }

        content.put("steps", steps);
        content.put("sizes", sizes);
        content.put("images", images);
        return content;
    }

    private String extractFirstTemplateImage(String rawJson) {
        if (!StringUtils.hasText(rawJson)) {
            return null;
        }
        try {
            Map<String, Object> raw = objectMapper.readValue(rawJson, new TypeReference<Map<String, Object>>() {});
            List<String> images = coerceListOfString(raw.get("images"));
            return images.isEmpty() ? null : images.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    private int refreshOrderWorkflowPrices(ProductionOrder order) throws Exception {
        if (order == null || !StringUtils.hasText(order.getStyleNo()) || !StringUtils.hasText(order.getProgressWorkflowJson())) {
            return 0;
        }

        List<Map<String, Object>> templateNodes = templateLibraryService.resolveProgressNodeUnitPrices(order.getStyleNo().trim());
        if (templateNodes == null || templateNodes.isEmpty()) {
            return 0;
        }

        Map<String, BigDecimal> priceMap = new HashMap<>();
        for (Map<String, Object> templateNode : templateNodes) {
            String name = String.valueOf(templateNode.getOrDefault("name", "")).trim();
            if (!StringUtils.hasText(name)) {
                continue;
            }
            BigDecimal price = toBigDecimal(templateNode.get("unitPrice"));
            priceMap.put(name, price == null ? BigDecimal.ZERO : price);
        }
        if (priceMap.isEmpty()) {
            return 0;
        }

        Map<String, Object> workflow = objectMapper.readValue(order.getProgressWorkflowJson(), new TypeReference<Map<String, Object>>() {});
        List<Map<String, Object>> nodes = coerceListOfMap(workflow.get("nodes"));
        if (nodes.isEmpty()) {
            return 0;
        }

        int changedCount = 0;
        for (Map<String, Object> node : nodes) {
            String nodeName = String.valueOf(node.getOrDefault("name", "")).trim();
            if (!StringUtils.hasText(nodeName) || !priceMap.containsKey(nodeName)) {
                continue;
            }
            BigDecimal nextPrice = priceMap.get(nodeName);
            BigDecimal currentPrice = toBigDecimal(node.get("unitPrice"));
            if (currentPrice == null || currentPrice.compareTo(nextPrice) != 0) {
                node.put("unitPrice", nextPrice);
                changedCount++;
            }
        }
        if (changedCount <= 0) {
            return 0;
        }

        workflow.put("nodes", nodes);
        productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, order.getId())
                .set(ProductionOrder::getProgressWorkflowJson, objectMapper.writeValueAsString(workflow))
                .update();
        return changedCount;
    }

    private static Map<String, Object> coerceMap(Object value) {
        if (value instanceof Map<?, ?> rawMap) {
            Map<String, Object> mapped = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                if (entry.getKey() == null) {
                    continue;
                }
                mapped.put(String.valueOf(entry.getKey()), entry.getValue());
            }
            return mapped;
        }
        return new LinkedHashMap<>();
    }

    private static List<Map<String, Object>> coerceListOfMap(Object value) {
        if (!(value instanceof List<?> rawList)) {
            return List.of();
        }
        List<Map<String, Object>> mapped = new ArrayList<>();
        for (Object item : rawList) {
            if (item instanceof Map<?, ?>) {
                mapped.add(coerceMap(item));
            }
        }
        return mapped;
    }

    private static List<String> coerceListOfString(Object value) {
        if (!(value instanceof List<?> rawList)) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (Object item : rawList) {
            if (item == null) {
                continue;
            }
            String text = String.valueOf(item).trim();
            if (StringUtils.hasText(text)) {
                out.add(text);
            }
        }
        return out;
    }

    private static BigDecimal toBigDecimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return new BigDecimal(number.toString());
        }
        try {
            String text = String.valueOf(value).trim();
            if (!StringUtils.hasText(text)) {
                return null;
            }
            return new BigDecimal(text);
        } catch (Exception e) {
            return null;
        }
    }
}
