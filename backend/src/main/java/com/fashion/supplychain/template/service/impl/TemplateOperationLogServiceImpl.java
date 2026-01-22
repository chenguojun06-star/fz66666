package com.fashion.supplychain.template.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.template.entity.TemplateOperationLog;
import com.fashion.supplychain.template.mapper.TemplateOperationLogMapper;
import com.fashion.supplychain.template.service.TemplateOperationLogService;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class TemplateOperationLogServiceImpl extends ServiceImpl<TemplateOperationLogMapper, TemplateOperationLog>
        implements TemplateOperationLogService {

    @Override
    public List<TemplateOperationLog> listByTemplateId(String templateId, String action) {
        LambdaQueryWrapper<TemplateOperationLog> wrapper = new LambdaQueryWrapper<TemplateOperationLog>()
                .eq(TemplateOperationLog::getTemplateId, templateId)
                .orderByDesc(TemplateOperationLog::getCreateTime);
        if (StringUtils.hasText(action)) {
            wrapper.eq(TemplateOperationLog::getAction, action.trim());
        }
        return list(wrapper);
    }
}
