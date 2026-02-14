package com.fashion.supplychain.finance.service;

import com.fashion.supplychain.finance.entity.MaterialReconciliation;

/**
 * 物料对账同步服务
 *
 * 职责：本模块内的对账记录创建和查询
 *
 * 注意：跨模块同步请使用 MaterialReconciliationSyncOrchestrator
 */
public interface MaterialReconciliationSyncService {

    /**
     * 创建物料对账记录（单模块操作）
     *
     * 注意：此方法只在本模块内创建记录，不处理跨模块数据查询
     * 完整的同步逻辑（含跨模块查询）请使用 MaterialReconciliationSyncOrchestrator.syncFromInbound()
     *
     * @param reconciliation 对账记录
     * @return 对账记录ID
     */
    String createReconciliation(MaterialReconciliation reconciliation);

    /**
     * 检查对账记录是否已存在
     *
     * 注意：此方法需要在Orchestrator中调用，因为需要查询入库记录信息
     *
     * @param purchaseId 采购单ID
     * @param materialCode 物料编码
     * @param inboundNo 入库单号
     * @return 是否已存在
     */
    boolean isReconciliationExists(String purchaseId, String materialCode, String inboundNo);
}
