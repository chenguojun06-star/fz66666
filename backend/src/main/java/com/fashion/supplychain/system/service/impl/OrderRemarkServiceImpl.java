package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.mapper.OrderRemarkMapper;
import com.fashion.supplychain.system.service.OrderRemarkService;
import org.springframework.stereotype.Service;

@Service
public class OrderRemarkServiceImpl extends ServiceImpl<OrderRemarkMapper, OrderRemark>
        implements OrderRemarkService {
}
