package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.mapper.BillAggregationMapper;
import com.fashion.supplychain.finance.service.BillAggregationService;
import org.springframework.stereotype.Service;

@Service
public class BillAggregationServiceImpl extends ServiceImpl<BillAggregationMapper, BillAggregation> implements BillAggregationService {
}
