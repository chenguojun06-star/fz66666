package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.Invoice;
import com.fashion.supplychain.finance.mapper.InvoiceMapper;
import com.fashion.supplychain.finance.service.InvoiceService;
import org.springframework.stereotype.Service;

@Service
public class InvoiceServiceImpl extends ServiceImpl<InvoiceMapper, Invoice> implements InvoiceService {
}
