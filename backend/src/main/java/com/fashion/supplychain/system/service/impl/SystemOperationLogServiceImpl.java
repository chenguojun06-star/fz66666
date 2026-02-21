package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.LoginLog;
import com.fashion.supplychain.system.mapper.LoginLogMapper;
import com.fashion.supplychain.system.service.SystemOperationLogService;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 操作日志服务实现（现已合并到登录日志）
 * @deprecated 请使用 LoginLogService
 */
@Deprecated
@Service
public class SystemOperationLogServiceImpl extends ServiceImpl<LoginLogMapper, LoginLog>
        implements SystemOperationLogService {

    @Override
    @Deprecated
    public List<LoginLog> listByBiz(String bizType, String bizId, String action) {
        LambdaQueryWrapper<LoginLog> wrapper = new LambdaQueryWrapper<LoginLog>()
                .eq(LoginLog::getLogType, "OPERATION")
                .orderByDesc(LoginLog::getLoginTime);
        if (StringUtils.hasText(bizType)) {
            wrapper.eq(LoginLog::getBizType, bizType.trim());
        }
        if (StringUtils.hasText(bizId)) {
            wrapper.eq(LoginLog::getBizId, bizId.trim());
        }
        if (StringUtils.hasText(action)) {
            wrapper.eq(LoginLog::getAction, action.trim());
        }
        return list(wrapper);
    }
}
