package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import com.fashion.supplychain.finance.mapper.FinishedProductSettlementMapper;
import com.fashion.supplychain.finance.service.FinishedProductSettlementService;
import org.springframework.stereotype.Service;

/**
 * 成品结算服务实现
 */
@Service
public class FinishedProductSettlementServiceImpl
        extends ServiceImpl<FinishedProductSettlementMapper, FinishedProductSettlement>
        implements FinishedProductSettlementService {
}
