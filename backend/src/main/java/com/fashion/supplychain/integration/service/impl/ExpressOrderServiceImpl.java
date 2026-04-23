package com.fashion.supplychain.integration.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.entity.ExpressOrder;
import com.fashion.supplychain.integration.mapper.ExpressOrderMapper;
import com.fashion.supplychain.integration.service.ExpressOrderService;
import org.springframework.stereotype.Service;

@Service
public class ExpressOrderServiceImpl extends ServiceImpl<ExpressOrderMapper, ExpressOrder> implements ExpressOrderService {
}
