package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.SystemOperationLog;
import com.fashion.supplychain.system.mapper.SystemOperationLogMapper;
import com.fashion.supplychain.system.service.SystemOperationLogService;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class SystemOperationLogServiceImpl extends ServiceImpl<SystemOperationLogMapper, SystemOperationLog>
        implements SystemOperationLogService {

    @Override
    public List<SystemOperationLog> listByBiz(String bizType, String bizId, String action) {
        LambdaQueryWrapper<SystemOperationLog> wrapper = new LambdaQueryWrapper<SystemOperationLog>()
                .orderByDesc(SystemOperationLog::getCreateTime);
        if (StringUtils.hasText(bizType)) {
            wrapper.eq(SystemOperationLog::getBizType, bizType.trim());
        }
        if (StringUtils.hasText(bizId)) {
            wrapper.eq(SystemOperationLog::getBizId, bizId.trim());
        }
        if (StringUtils.hasText(action)) {
            wrapper.eq(SystemOperationLog::getAction, action.trim());
        }
        return list(wrapper);
    }
}
