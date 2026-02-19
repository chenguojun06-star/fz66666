package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.MaterialRoll;

import java.util.List;

/**
 * 面辅料料卷 Service
 */
public interface MaterialRollService extends IService<MaterialRoll> {

    /**
     * 生成唯一料卷编号（MR + YYYYMMDD + 5位序号）
     */
    String generateRollCode();

    /**
     * 查询某入库单下的所有料卷
     */
    List<MaterialRoll> listByInboundId(String inboundId);

    /**
     * 按 rollCode 查询料卷（支持多租户隔离）
     */
    MaterialRoll findByRollCode(String rollCode);
}
