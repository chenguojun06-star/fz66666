package com.fashion.supplychain.template.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.template.entity.TemplateOperationLog;
import java.util.List;

public interface TemplateOperationLogService extends IService<TemplateOperationLog> {
    List<TemplateOperationLog> listByTemplateId(String templateId, String action);
}
