package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.PurchaseReturn;

/**
 * 采购退货单Service
 * 单领域CRUD，不涉及事务（事务在Orchestrator层）
 */
public interface PurchaseReturnService extends IService<PurchaseReturn> {
}