package com.fashion.supplychain.warehouse.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.warehouse.entity.WarehouseLocation;
import com.fashion.supplychain.warehouse.mapper.WarehouseLocationMapper;
import com.fashion.supplychain.warehouse.service.WarehouseLocationService;
import org.springframework.stereotype.Service;

@Service
public class WarehouseLocationServiceImpl extends ServiceImpl<WarehouseLocationMapper, WarehouseLocation> implements WarehouseLocationService {
}
