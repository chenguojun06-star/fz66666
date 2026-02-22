package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.TenantSubscription;
import com.fashion.supplychain.system.mapper.TenantSubscriptionMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 租户订阅Service
 */
@Slf4j
@Service
public class TenantSubscriptionService extends ServiceImpl<TenantSubscriptionMapper, TenantSubscription> {

    /**
     * 生成订阅编号：SUB20260210XXXXX
     * 使用时间戳+随机数避免并发冲突（count()+1 不是原子操作）
     */
    public String generateSubscriptionNo() {
        String dateStr = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        int random = ThreadLocalRandom.current().nextInt(10000, 99999);
        return String.format("SUB%s%05d", dateStr, random);
    }
}
