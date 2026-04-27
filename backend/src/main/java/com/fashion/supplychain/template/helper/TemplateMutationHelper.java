package com.fashion.supplychain.template.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.entity.TemplateOperationLog;
import com.fashion.supplychain.template.event.TemplatePriceChangedEvent;
import com.fashion.supplychain.template.orchestration.TemplateStyleOrchestrator;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fashion.supplychain.template.service.TemplateOperationLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

@Component
@Slf4j
public class TemplateMutationHelper {

    @Autowired private TemplateLibraryService templateLibraryService;
    @Autowired private StyleInfoService styleInfoService;
    @Autowired private TemplateOperationLogService templateOperationLogService;
    @Autowired private TemplateStyleOrchestrator templateStyleOrchestrator;
    @Autowired private ProductionOrderOrchestrator productionOrderOrchestrator;
    @Autowired private ApplicationEventPublisher eventPublisher;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private TemplateQueryHelper templateQueryHelper;


    public Map<String, Object> saveProcessPriceTemplate(Map<String, Object> body) {
        Map<String, Object> payload = body == null ? Map.of() : body;
        String styleNo = String.valueOf(payload.getOrDefault("styleNo", "")).trim();
        if (!StringUtils.hasText(styleNo)) {
            throw new IllegalArgumentException("styleNo不能为空");
        }
        templateQueryHelper.assertFactoryCanAccessStyle(styleNo);

        Map<String, Object> content = TemplateParseUtils.coerceMap(payload.get("templateContent"));
        List<Map<String, Object>> rawSteps = TemplateParseUtils.coerceListOfMap(content.get("steps"));
        if (rawSteps.isEmpty()) {
            throw new IllegalArgumentException("请至少配置一条工序单价");
        }

        List<Map<String, Object>> normalizedSteps = normalizeTemplateSteps(rawSteps);
        if (normalizedSteps.isEmpty()) {
            throw new IllegalArgumentException("请至少填写一条有效工序");
        }

        Map<String, Object> normalizedContent = buildNormalizedContent(content, normalizedSteps);
        persistProcessPriceTemplate(styleNo, payload, normalizedContent);
        publishPriceChangedEvent(styleNo);

        return templateQueryHelper.getProcessPriceTemplate(styleNo);
    }

    private List<Map<String, Object>> normalizeTemplateSteps(List<Map<String, Object>> rawSteps) {
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
            String description = String.valueOf(rawStep.getOrDefault("description", rawStep.getOrDefault("remark", ""))).trim();
            if (StringUtils.hasText(description)) {
                step.put("description", description);
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

            BigDecimal unitPrice = TemplateParseUtils.toBigDecimal(rawStep.containsKey("unitPrice") ? rawStep.get("unitPrice") : rawStep.get("price"));
            step.put("unitPrice", unitPrice == null ? BigDecimal.ZERO : unitPrice.max(BigDecimal.ZERO));

            Map<String, Object> rawSizePrices = TemplateParseUtils.coerceMap(rawStep.get("sizePrices"));
            if (!rawSizePrices.isEmpty()) {
                Map<String, Object> sizePrices = new LinkedHashMap<>();
                for (Map.Entry<String, Object> entry : rawSizePrices.entrySet()) {
                    String key = String.valueOf(entry.getKey() == null ? "" : entry.getKey()).trim();
                    if (!StringUtils.hasText(key)) {
                        continue;
                    }
                    BigDecimal price = TemplateParseUtils.toBigDecimal(entry.getValue());
                    sizePrices.put(key, price == null ? BigDecimal.ZERO : price.max(BigDecimal.ZERO));
                }
                if (!sizePrices.isEmpty()) {
                    step.put("sizePrices", sizePrices);
                }
            }

            normalizedSteps.add(step);
            index++;
        }
        return normalizedSteps;
    }

    private Map<String, Object> buildNormalizedContent(Map<String, Object> content, List<Map<String, Object>> normalizedSteps) {
        List<String> sizes = TemplateParseUtils.coerceListOfString(content.get("sizes"));
        List<String> images = TemplateParseUtils.coerceListOfString(content.get("images"));
        Map<String, Object> normalizedContent = new LinkedHashMap<>();
        normalizedContent.put("steps", normalizedSteps);
        if (!sizes.isEmpty()) {
            normalizedContent.put("sizes", sizes);
        }
        if (!images.isEmpty()) {
            normalizedContent.put("images", images);
        }
        return normalizedContent;
    }

    private void persistProcessPriceTemplate(String styleNo, Map<String, Object> payload, Map<String, Object> normalizedContent) {
        String templateName = String.valueOf(payload.getOrDefault("templateName", "")).trim();
        if (!StringUtils.hasText(templateName)) {
            templateName = styleNo + "-工序单价模板";
        }

        TemplateLibrary template = new TemplateLibrary();
        template.setTemplateType("process_price");
        template.setTemplateKey("style_" + styleNo);
        template.setTemplateName(templateName);
        template.setSourceStyleNo(styleNo);
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
    }

    private void publishPriceChangedEvent(String styleNo) {
        try {
            eventPublisher.publishEvent(new TemplatePriceChangedEvent(
                this,
                styleNo,
                "process",
                UserContext.username()
            ));
            log.info("[价格变更事件] 已发布工序单价模板更新事件 - styleNo: {}", styleNo);
        } catch (Exception e) {
            log.warn("[价格变更事件] 发布失败 - styleNo: {}", styleNo, e);
        }
    }

    public TemplateLibrary create(TemplateLibrary tpl) {
        boolean isAdmin = UserContext.isSupervisorOrAbove();
        boolean isFactory = DataPermissionHelper.isFactoryAccount();
        if (!isAdmin && !isFactory) {
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


    public boolean save(TemplateLibrary tpl) {
        boolean isAdmin = UserContext.isSupervisorOrAbove();
        boolean isFactory = DataPermissionHelper.isFactoryAccount();
        if (!isAdmin && !isFactory) {
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


    public boolean update(TemplateLibrary tpl) {
        assertUpdatePermission();
        assertTemplateIdValid(tpl);
        TemplateLibrary current = loadAndAssertOwnership(tpl);

        String previousName = String.valueOf(current.getTemplateName() == null ? "" : current.getTemplateName()).trim();
        String previousContent = String.valueOf(current.getTemplateContent() == null ? "" : current.getTemplateContent()).trim();

        if (isLocked(current)) {
            throw new IllegalStateException("模板已锁定，仅管理员可退回后修改");
        }

        applyTemplateFields(tpl, current);
        boolean ok = templateLibraryService.updateById(current);
        if (!ok) throw new IllegalStateException("保存失败");

        String type = current.getTemplateType();
        String ssn = current.getSourceStyleNo();
        boolean contentChanged = !previousContent.equals(current.getTemplateContent());
        handleProgressRecompute(type, ssn, contentChanged);
        publishPriceChangeEventIfNeeded(type, ssn, contentChanged);
        syncSiblingNamesIfNeeded(previousName, current);

        return true;
    }

    private void assertUpdatePermission() {
        boolean isAdmin = UserContext.isSupervisorOrAbove();
        boolean isFactory = DataPermissionHelper.isFactoryAccount();
        if (!isAdmin && !isFactory) {
            throw new AccessDeniedException("无权限操作");
        }
    }

    private void assertTemplateIdValid(TemplateLibrary tpl) {
        if (tpl == null || !StringUtils.hasText(String.valueOf(tpl.getId() == null ? "" : tpl.getId()).trim())) {
            throw new IllegalArgumentException("id不能为空");
        }
    }

    private TemplateLibrary loadAndAssertOwnership(TemplateLibrary tpl) {
        TemplateLibrary current = templateLibraryService.getById(String.valueOf(tpl.getId()));
        if (current == null) throw new NoSuchElementException("模板不存在");
        if (current.getTenantId() != null) {
            TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "模板");
        }
        return current;
    }

    private void applyTemplateFields(TemplateLibrary tpl, TemplateLibrary current) {
        String type = String.valueOf(tpl.getTemplateType() == null ? current.getTemplateType() : tpl.getTemplateType()).trim().toLowerCase();
        String key = String.valueOf(tpl.getTemplateKey() == null ? current.getTemplateKey() : tpl.getTemplateKey()).trim();
        String name = String.valueOf(tpl.getTemplateName() == null ? current.getTemplateName() : tpl.getTemplateName()).trim();
        String content = String.valueOf(tpl.getTemplateContent() == null ? current.getTemplateContent() : tpl.getTemplateContent()).trim();
        if (!StringUtils.hasText(type) || !StringUtils.hasText(key) || !StringUtils.hasText(name) || !StringUtils.hasText(content)) {
            throw new IllegalArgumentException("模板参数不完整");
        }
        current.setTemplateType(type);
        current.setTemplateKey(key);
        current.setTemplateName(name);
        current.setTemplateContent(content);
        String ssn = String.valueOf(tpl.getSourceStyleNo() == null ? current.getSourceStyleNo() : tpl.getSourceStyleNo()).trim();
        current.setSourceStyleNo(StringUtils.hasText(ssn) ? ssn : null);
        current.setLocked(1);
        current.setOperatorName(UserContext.username());
        current.setUpdateTime(LocalDateTime.now());
    }

    private void handleProgressRecompute(String type, String ssn, boolean contentChanged) {
        if (!"progress".equalsIgnoreCase(type) || !StringUtils.hasText(ssn) || !contentChanged) return;
        try {
            productionOrderOrchestrator.recomputeProgressByStyleNo(ssn);
        } catch (Exception e) {
            log.warn("Failed to recompute progress by styleNo: styleNo={}", ssn, e);
        }
    }

    private void publishPriceChangeEventIfNeeded(String type, String ssn, boolean contentChanged) {
        if (!"process".equalsIgnoreCase(type) || !contentChanged) return;
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

    private void syncSiblingNamesIfNeeded(String previousName, TemplateLibrary current) {
        String newName = String.valueOf(current.getTemplateName() == null ? "" : current.getTemplateName()).trim();
        boolean nameChanged = !previousName.equals(newName);
        String groupKey = String.valueOf(current.getTemplateKey() == null ? "" : current.getTemplateKey()).trim();
        if (!nameChanged || !StringUtils.hasText(groupKey)) return;

        String base = newName;
        for (String suffix : List.of("-BOM模板", "-尺码模板", "-工艺模板", "-工序单价模板", "-进度模板")) {
            if (base.endsWith(suffix)) {
                base = base.substring(0, Math.max(0, base.length() - suffix.length()));
                break;
            }
        }
        base = String.valueOf(base == null ? "" : base).trim();
        if (!StringUtils.hasText(base)) base = newName;

        List<TemplateLibrary> siblings = templateLibraryService.list(
                new LambdaQueryWrapper<TemplateLibrary>().eq(TemplateLibrary::getTemplateKey, groupKey));
        LocalDateTime now = LocalDateTime.now();
        for (TemplateLibrary s : siblings) {
            if (s == null) continue;
            String t = String.valueOf(s.getTemplateType() == null ? "" : s.getTemplateType()).trim().toLowerCase();
            String suffix = "";
            if ("bom".equals(t)) suffix = "-BOM模板";
            else if ("size".equals(t)) suffix = "-尺码模板";
            else if ("process".equals(t)) suffix = "-工艺模板";
            else if ("process_price".equals(t)) suffix = "-工序单价模板";
            else if ("progress".equals(t)) suffix = "-进度模板";
            s.setTemplateName(suffix.isEmpty() ? base : base + suffix);
            s.setUpdateTime(now);
            templateLibraryService.updateById(s);
        }
    }

    /** 取消修改：将模板重新锁定（不保存任何改动） */
    public boolean lockTemplate(String id) {
        String tid = String.valueOf(id == null ? "" : id).trim();
        if (!StringUtils.hasText(tid)) {
            throw new IllegalArgumentException("id不能为空");
        }
        TemplateLibrary current = templateLibraryService.getById(tid);
        if (current == null) {
            throw new NoSuchElementException("模板不存在");
        }
        if (current.getTenantId() != null) {
            TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "模板");
        }
        if (isLocked(current)) {
            return true; // 已锁定，幂等
        }
        current.setLocked(1);
        current.setUpdateTime(LocalDateTime.now());
        boolean ok = templateLibraryService.updateById(current);
        if (!ok) {
            throw new IllegalStateException("锁定失败");
        }
        return true;
    }


    public boolean rollback(String id, String reason) {
        // 管理员/主管/工厂用户（仅限其被分配款号的模板）均可退回
        // 使用 isSupervisorOrAbove()（含"管理"角色），与前端 isAdminUser(role.includes('管理')) 保持一致
        boolean isAdmin = UserContext.isSupervisorOrAbove();
        boolean isFactory = DataPermissionHelper.isFactoryAccount();
        if (!isAdmin && !isFactory) {
            log.warn("[模板退回] 权限不足 userId={}, role={}, factoryId={}, isSupervisor={}, isFactory={}",
                    UserContext.userId(), UserContext.role(), UserContext.factoryId(), isAdmin, isFactory);
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
        // 工厂用户只能解锁自己被分配款号的模板
        if (DataPermissionHelper.isFactoryAccount()) {
            templateQueryHelper.assertFactoryCanAccessStyle(current.getSourceStyleNo());
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

    public boolean delete(String id) {
        boolean isAdmin = UserContext.isSupervisorOrAbove();
        boolean isFactory = DataPermissionHelper.isFactoryAccount();
        if (!isAdmin && !isFactory) {
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
        if (StringUtils.hasText(UserContext.factoryId())) {
            throw new AccessDeniedException("外发工厂账号无权执行此操作");
        }

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
        if (StringUtils.hasText(UserContext.factoryId())) {
            throw new AccessDeniedException("外发工厂账号无权执行此操作");
        }

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

}
