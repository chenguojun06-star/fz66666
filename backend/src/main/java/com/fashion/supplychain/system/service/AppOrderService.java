package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.AppOrder;
import com.fashion.supplychain.system.mapper.AppOrderMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 应用订单Service
 */
@Slf4j
@Service
public class AppOrderService extends ServiceImpl<AppOrderMapper, AppOrder> {

    /**
     * 生成订单号：ORD20260210001
     */
    public String generateOrderNo() {
        String dateStr = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        long count = count() + 1;
        return String.format("ORD%s%03d", dateStr, count);
    }
}
