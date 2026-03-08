package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.ProductionExceptionReport;
import com.fashion.supplychain.production.mapper.ProductionExceptionReportMapper;
import com.fashion.supplychain.production.service.ProductionExceptionReportService;
import org.springframework.stereotype.Service;

@Service
public class ProductionExceptionReportServiceImpl extends ServiceImpl<ProductionExceptionReportMapper, ProductionExceptionReport> implements ProductionExceptionReportService {
}
