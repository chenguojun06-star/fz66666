package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.CuttingBom;
import java.util.List;

public interface CuttingBomService extends IService<CuttingBom> {

    List<CuttingBom> listByCuttingTaskId(String cuttingTaskId);

    List<CuttingBom> listByStyleNo(String styleNo);
}
