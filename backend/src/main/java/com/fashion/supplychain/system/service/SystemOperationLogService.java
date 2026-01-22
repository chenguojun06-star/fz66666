package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.SystemOperationLog;
import java.util.List;

public interface SystemOperationLogService extends IService<SystemOperationLog> {
    List<SystemOperationLog> listByBiz(String bizType, String bizId, String action);
}
