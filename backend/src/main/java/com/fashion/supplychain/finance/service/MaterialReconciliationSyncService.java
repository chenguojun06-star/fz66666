package com.fashion.supplychain.finance.service;

import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialPurchase;

/**
 * 物料对账同步服务
 *
 * 职责：将物料入库、采购数据同步到对账系统
 *
 * 数据流向：
 * MaterialInbound（入库记录）→ MaterialReconciliation（物料对账）
 * MaterialPurchase（采购记录）→ MaterialReconciliation（物料对账）
 *
 * @author Fashion Supply Chain System
 * @since 2026-01-31
 */
public interface MaterialReconciliationSyncService {

    /**
     * 从入库记录同步到物料对账
     *
     * 触发时机：采购到货入库成功后
     *
     * @param inbound 入库记录
     * @param purchase 关联的采购单
     * @return 对账记录ID
     */
    String syncFromInbound(MaterialInbound inbound, MaterialPurchase purchase);

    /**
     * 从采购记录批量同步到物料对账
     *
     * 用途：补录历史数据、定期同步
     *
     * @param purchaseId 采购单ID
     * @return 同步的对账记录数量
     */
    int syncFromPurchase(String purchaseId);

    /**
     * 根据时间范围批量同步
     *
     * @param startDate 开始日期（YYYY-MM-DD）
     * @param endDate 结束日期（YYYY-MM-DD）
     * @return 同步的对账记录数量
     */
    int syncByDateRange(String startDate, String endDate);

    /**
     * 检查入库记录是否已同步到对账
     *
     * @param inboundId 入库记录ID
     * @return true=已同步，false=未同步
     */
    boolean isInboundSynced(String inboundId);
}
