package com.fashion.supplychain.warehouse.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.warehouse.entity.StockTransfer;
import com.fashion.supplychain.warehouse.mapper.StockTransferMapper;
import com.fashion.supplychain.warehouse.service.StockTransferService;
import org.springframework.stereotype.Service;

@Service
public class StockTransferServiceImpl extends ServiceImpl<StockTransferMapper, StockTransfer> implements StockTransferService {
}
