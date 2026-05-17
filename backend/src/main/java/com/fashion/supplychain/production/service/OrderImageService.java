package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.OrderImage;
import com.fashion.supplychain.production.mapper.OrderImageMapper;
import org.springframework.stereotype.Service;

@Service
public class OrderImageService extends ServiceImpl<OrderImageMapper, OrderImage> {
}
