package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.CuttingMaterialUsage;
import java.util.List;

public interface CuttingMaterialUsageService extends IService<CuttingMaterialUsage> {

    /**
     * 查询某裁剪任务的用料台账（按物料行）
     */
    List<CuttingMaterialUsage> listByCuttingTaskId(String cuttingTaskId);
}
