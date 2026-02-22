package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.AppOrder;
import com.fashion.supplychain.system.mapper.AppOrderMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 应用订单Service
 */
@Slf4j
@Service
public class AppOrderService extends ServiceImpl<AppOrderMapper, AppOrder> {

    /**
     * 生成订单号：ORD20260210XXXXX
     * 使用时间戳+随机数避免并发冲突（count()+1 不是原子操作）
     */
    public String generateOrderNo() {
        String dateStr = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        int random = ThreadLocalRandom.current().nextInt(10000, 99999);
        return String.format("ORD%s%05d", dateStr, random);
    }
}
