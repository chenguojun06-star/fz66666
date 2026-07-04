package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.PurchaseReturn;
import com.fashion.supplychain.production.mapper.PurchaseReturnMapper;
import com.fashion.supplychain.production.service.PurchaseReturnService;
import org.springframework.stereotype.Service;

/**
 * 采购退货单Service实现
 * 单领域CRUD，不涉及事务（事务在Orchestrator层）
 */
@Service
public class PurchaseReturnServiceImpl extends ServiceImpl<PurchaseReturnMapper, PurchaseReturn> implements PurchaseReturnService {
}