package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.ProcessPriceAdjustment;
import com.fashion.supplychain.production.mapper.ProcessPriceAdjustmentMapper;
import com.fashion.supplychain.production.service.ProcessPriceAdjustmentService;
import org.springframework.stereotype.Service;

@Service
public class ProcessPriceAdjustmentServiceImpl
        extends ServiceImpl<ProcessPriceAdjustmentMapper, ProcessPriceAdjustment>
        implements ProcessPriceAdjustmentService {
}
