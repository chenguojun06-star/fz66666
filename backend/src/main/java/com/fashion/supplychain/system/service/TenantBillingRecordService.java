package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.TenantBillingRecord;
import com.fashion.supplychain.system.mapper.TenantBillingRecordMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 租户计费记录Service
 */
@Slf4j
@Service
public class TenantBillingRecordService extends ServiceImpl<TenantBillingRecordMapper, TenantBillingRecord> {

    /**
     * 生成账单编号：BILL20260222001
     */
    public String generateBillingNo() {
        String dateStr = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        long count = count() + 1;
        return String.format("BILL%s%03d", dateStr, count);
    }
}
