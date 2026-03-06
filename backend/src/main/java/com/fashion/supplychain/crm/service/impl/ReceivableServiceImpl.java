package com.fashion.supplychain.crm.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.mapper.ReceivableMapper;
import com.fashion.supplychain.crm.service.ReceivableService;
import org.springframework.stereotype.Service;

@Service
public class ReceivableServiceImpl extends ServiceImpl<ReceivableMapper, Receivable>
        implements ReceivableService {
}
