package com.fashion.supplychain.integration;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 模拟外部平台适配器
 * 用于开发测试阶段
 */
@Slf4j
@Service
public class MockPlatformAdapter implements ExternalPlatformService {

    @Override
    public String getPlatformName() {
        return "MockPlatform";
    }

    @Override
    public boolean syncStock(String skuCode, int quantity) {
        log.info("[MockPlatform] Syncing stock for SKU: {}, Quantity: {}", skuCode, quantity);
        // 模拟网络延迟
        try {
            Thread.sleep(100);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        log.info("[MockPlatform] Sync success.");
        return true;
    }
}
