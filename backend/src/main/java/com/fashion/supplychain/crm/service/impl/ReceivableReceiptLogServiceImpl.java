package com.fashion.supplychain.crm.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.crm.entity.ReceivableReceiptLog;
import com.fashion.supplychain.crm.mapper.ReceivableReceiptLogMapper;
import com.fashion.supplychain.crm.service.ReceivableReceiptLogService;
import org.springframework.stereotype.Service;

@Service
public class ReceivableReceiptLogServiceImpl extends ServiceImpl<ReceivableReceiptLogMapper, ReceivableReceiptLog>
        implements ReceivableReceiptLogService {
}
