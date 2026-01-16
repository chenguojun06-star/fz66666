package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;

import java.util.Map;

public interface MaterialReconciliationService extends IService<MaterialReconciliation> {
    
    /**
     * 分页查询物料对账列表
     * @param params 查询参数
     * @return 分页结果
     */
    IPage<MaterialReconciliation> queryPage(Map<String, Object> params);
}
