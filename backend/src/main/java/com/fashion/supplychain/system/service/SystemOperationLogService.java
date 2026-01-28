package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.LoginLog;
import java.util.List;

/**
 * 操作日志服务（现已合并到登录日志）
 * @deprecated 请使用 LoginLogService
 */
@Deprecated
public interface SystemOperationLogService extends IService<LoginLog> {
    List<LoginLog> listByBiz(String bizType, String bizId, String action);
}
