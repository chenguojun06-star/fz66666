package com.fashion.supplychain.template.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.entity.TemplateOperationLog;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fashion.supplychain.template.service.TemplateOperationLogService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
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
    private com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator productionOrderOrchestrator;

    public IPage<TemplateLibrary> list(Map<String, Object> params) {
        return templateLibraryService.queryPage(params);
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
        if (!List.of("bom", "size", "process", "process_price", "progress").contains(type)) {
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
        return created;
    }

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

        tpl.setTemplateType(type);
        tpl.setTemplateKey(key);
        tpl.setTemplateName(name);
        tpl.setTemplateContent(content);
        tpl.setLocked(1);
        String ssn = String.valueOf(tpl.getSourceStyleNo() == null ? "" : tpl.getSourceStyleNo()).trim();
        tpl.setSourceStyleNo(StringUtils.hasText(ssn) ? ssn : null);
        tpl.setOperatorName(UserContext.username());
        LocalDateTime now = LocalDateTime.now();
        if (tpl.getCreateTime() == null) {
            tpl.setCreateTime(now);
        }
        tpl.setUpdateTime(now);
        boolean ok = templateLibraryService.save(tpl);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

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
            throw new IllegalStateException("删除失败");
        }
        return true;
    }

    public List<TemplateLibrary> createFromStyle(Map<String, Object> body) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
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
        List<TemplateLibrary> created = templateLibraryService.createFromStyle(sourceStyleNo, types);
        return created;
    }

    public boolean applyToStyle(Map<String, Object> body) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
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
        boolean ok = templateLibraryService.applyToStyle(templateId, targetStyleId, mode);
        if (!ok) {
            throw new IllegalStateException("导入失败");
        }
        return true;
    }
}
