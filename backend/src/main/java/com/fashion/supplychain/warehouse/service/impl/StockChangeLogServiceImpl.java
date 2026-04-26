package com.fashion.supplychain.warehouse.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.warehouse.entity.StockChangeLog;
import com.fashion.supplychain.warehouse.mapper.StockChangeLogMapper;
import com.fashion.supplychain.warehouse.service.StockChangeLogService;
import org.springframework.stereotype.Service;

@Service
public class StockChangeLogServiceImpl extends ServiceImpl<StockChangeLogMapper, StockChangeLog> implements StockChangeLogService {
}
