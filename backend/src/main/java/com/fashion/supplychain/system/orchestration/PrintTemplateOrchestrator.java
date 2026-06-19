package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.PrintTemplate;
import com.fashion.supplychain.system.mapper.PrintTemplateMapper;
import java.time.LocalDateTime;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
public class PrintTemplateOrchestrator {

    @Autowired
    private PrintTemplateMapper printTemplateMapper;

    public List<PrintTemplate> list(String templateType) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<PrintTemplate> qw = new LambdaQueryWrapper<>();
        qw.eq(PrintTemplate::getTenantId, tenantId);
        if (templateType != null) {
            qw.eq(PrintTemplate::getTemplateType, templateType);
        }
        qw.orderByDesc(PrintTemplate::getIsDefault).orderByDesc(PrintTemplate::getUpdateTime);
        return printTemplateMapper.selectList(qw);
    }

    @Transactional(rollbackFor = Exception.class)
    public PrintTemplate save(PrintTemplate template) {
        Long tenantId = UserContext.tenantId();
        template.setTenantId(tenantId);
        if (template.getCreateTime() == null) {
            template.setCreateTime(LocalDateTime.now());
        }
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
            PrintTemplate existing = printTemplateMapper.selectById(template.getId());
            if (existing == null || !existing.getTenantId().equals(tenantId)) {
                throw new BusinessException("模板不存在或无权限修改");
            }
            printTemplateMapper.updateById(template);
        }
        return template;
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<PrintTemplate> qw = new LambdaQueryWrapper<>();
        qw.eq(PrintTemplate::getId, id).eq(PrintTemplate::getTenantId, tenantId);
        printTemplateMapper.delete(qw);
    }

    @Transactional(rollbackFor = Exception.class)
    public void setDefault(Long id) {
        Long tenantId = UserContext.tenantId();
        PrintTemplate t = printTemplateMapper.selectById(id);
        if (t == null || !t.getTenantId().equals(tenantId)) {
            throw new BusinessException("模板不存在");
        }
        LambdaUpdateWrapper<PrintTemplate> uw = new LambdaUpdateWrapper<>();
        uw.eq(PrintTemplate::getTenantId, tenantId)
                .eq(PrintTemplate::getTemplateType, t.getTemplateType())
                .set(PrintTemplate::getIsDefault, false);
        printTemplateMapper.update(null, uw);
        t.setIsDefault(true);
        t.setUpdateTime(LocalDateTime.now());
        printTemplateMapper.updateById(t);
    }
}
