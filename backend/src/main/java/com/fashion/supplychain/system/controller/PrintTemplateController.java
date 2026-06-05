package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.PrintTemplate;
import com.fashion.supplychain.system.mapper.PrintTemplateMapper;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system/print-template")
@PreAuthorize("isAuthenticated()")
public class PrintTemplateController {

    @Autowired
    private PrintTemplateMapper printTemplateMapper;

    @GetMapping("/list")
    public Result<List<PrintTemplate>> list(@RequestParam(required = false) String templateType) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<PrintTemplate> qw = new LambdaQueryWrapper<>();
        qw.eq(PrintTemplate::getTenantId, tenantId);
        if (templateType != null) {
            qw.eq(PrintTemplate::getTemplateType, templateType);
        }
        qw.orderByDesc(PrintTemplate::getIsDefault).orderByDesc(PrintTemplate::getUpdateTime);
        return Result.success(printTemplateMapper.selectList(qw));
    }

    @PostMapping
    public Result<PrintTemplate> save(@RequestBody PrintTemplate template) {
        Long tenantId = UserContext.tenantId();
        template.setTenantId(tenantId);
        template.setCreateTime(LocalDateTime.now());
        template.setUpdateTime(LocalDateTime.now());
        if (template.getIsDefault() != null && template.getIsDefault()) {
            LambdaUpdateWrapper<PrintTemplate> uw = new LambdaUpdateWrapper<>();
            uw.eq(PrintTemplate::getTenantId, tenantId)
                    .eq(PrintTemplate::getTemplateType, template.getTemplateType())
                    .set(PrintTemplate::getIsDefault, false);
            printTemplateMapper.update(null, uw);
        }
        if (template.getId() == null) {
            printTemplateMapper.insert(template);
        } else {
            printTemplateMapper.updateById(template);
        }
        return Result.success(template);
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<PrintTemplate> qw = new LambdaQueryWrapper<>();
        qw.eq(PrintTemplate::getId, id).eq(PrintTemplate::getTenantId, tenantId);
        printTemplateMapper.delete(qw);
        return Result.success(null);
    }

    @PutMapping("/{id}/set-default")
    public Result<Void> setDefault(@PathVariable Long id) {
        Long tenantId = UserContext.tenantId();
        PrintTemplate t = printTemplateMapper.selectById(id);
        if (t == null || !t.getTenantId().equals(tenantId)) {
            return Result.fail("模板不存在");
        }
        LambdaUpdateWrapper<PrintTemplate> uw = new LambdaUpdateWrapper<>();
        uw.eq(PrintTemplate::getTenantId, tenantId)
                .eq(PrintTemplate::getTemplateType, t.getTemplateType())
                .set(PrintTemplate::getIsDefault, false);
        printTemplateMapper.update(null, uw);
        t.setIsDefault(true);
        t.setUpdateTime(LocalDateTime.now());
        printTemplateMapper.updateById(t);
        return Result.success(null);
    }
}
