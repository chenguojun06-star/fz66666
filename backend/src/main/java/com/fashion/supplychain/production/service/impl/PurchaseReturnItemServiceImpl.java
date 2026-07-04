package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.PurchaseReturnItem;
import com.fashion.supplychain.production.mapper.PurchaseReturnItemMapper;
import com.fashion.supplychain.production.service.PurchaseReturnItemService;
import org.springframework.stereotype.Service;

/**
 * 采购退货物料明细Service实现
 * 单领域CRUD，不涉及事务（事务在Orchestrator层）
 */
@Service
public class PurchaseReturnItemServiceImpl extends ServiceImpl<PurchaseReturnItemMapper, PurchaseReturnItem> implements PurchaseReturnItemService {
}