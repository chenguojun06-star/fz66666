package com.fashion.supplychain.integration.ecommerce.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.mapper.EcommerceOrderMapper;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import org.springframework.stereotype.Service;

@Service
public class EcommerceOrderServiceImpl
        extends ServiceImpl<EcommerceOrderMapper, EcommerceOrder>
        implements EcommerceOrderService {
}
