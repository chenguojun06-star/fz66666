package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.PatternScanRecord;
import com.fashion.supplychain.production.mapper.PatternScanRecordMapper;
import com.fashion.supplychain.production.service.PatternScanRecordService;
import org.springframework.stereotype.Service;

/**
 * 样板生产扫码记录Service实现
 */
@Service
public class PatternScanRecordServiceImpl extends ServiceImpl<PatternScanRecordMapper, PatternScanRecord> implements PatternScanRecordService {
}
