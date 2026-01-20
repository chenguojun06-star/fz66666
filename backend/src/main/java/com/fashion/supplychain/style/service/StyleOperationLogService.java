package com.fashion.supplychain.style.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.style.entity.StyleOperationLog;

import java.util.List;

public interface StyleOperationLogService extends IService<StyleOperationLog> {
    List<StyleOperationLog> listByStyleId(Long styleId, String bizType, String action);
}
