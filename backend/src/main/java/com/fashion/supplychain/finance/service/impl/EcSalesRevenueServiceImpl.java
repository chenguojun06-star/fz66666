package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.EcSalesRevenue;
import com.fashion.supplychain.finance.mapper.EcSalesRevenueMapper;
import com.fashion.supplychain.finance.service.EcSalesRevenueService;
import org.springframework.stereotype.Service;

/**
 * 电商销售收入流水 ServiceImpl
 */
@Service
public class EcSalesRevenueServiceImpl
        extends ServiceImpl<EcSalesRevenueMapper, EcSalesRevenue>
        implements EcSalesRevenueService {
}
