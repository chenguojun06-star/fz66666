package com.fashion.supplychain.crm.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.crm.entity.SalesReturn;
import com.fashion.supplychain.crm.mapper.SalesReturnMapper;
import com.fashion.supplychain.crm.service.SalesReturnService;
import org.springframework.stereotype.Service;

@Service
public class SalesReturnServiceImpl extends ServiceImpl<SalesReturnMapper, SalesReturn> implements SalesReturnService {
}