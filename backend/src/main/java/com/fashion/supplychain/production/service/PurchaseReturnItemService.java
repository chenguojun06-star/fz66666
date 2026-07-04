package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.PurchaseReturnItem;

/**
 * 采购退货物料明细Service
 * 单领域CRUD，不涉及事务（事务在Orchestrator层）
 */
public interface PurchaseReturnItemService extends IService<PurchaseReturnItem> {
}