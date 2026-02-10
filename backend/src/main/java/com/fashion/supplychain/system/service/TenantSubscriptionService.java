package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.TenantSubscription;
import com.fashion.supplychain.system.mapper.TenantSubscriptionMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 租户订阅Service
 */
@Slf4j
@Service
public class TenantSubscriptionService extends ServiceImpl<TenantSubscriptionMapper, TenantSubscription> {

    /**
     * 生成订阅编号：SUB20260210001
     */
    public String generateSubscriptionNo() {
        String dateStr = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        long count = count() + 1;
        return String.format("SUB%s%03d", dateStr, count);
    }
}
