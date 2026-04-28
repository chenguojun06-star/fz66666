package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.dto.OrderShareResponse;
import com.fashion.supplychain.production.helper.OrderShareHelper;
import com.fashion.supplychain.production.helper.OutstockShareHelper;
import com.fashion.supplychain.warehouse.dto.OutstockShareResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class OrderShareOrchestrator {

    private final OrderShareHelper orderShareHelper;
    private final OutstockShareHelper outstockShareHelper;

    public OrderShareOrchestrator(OrderShareHelper orderShareHelper, OutstockShareHelper outstockShareHelper) {
        this.orderShareHelper = orderShareHelper;
        this.outstockShareHelper = outstockShareHelper;
    }

    public String generateShareToken(String orderId) {
        return orderShareHelper.generateShareToken(orderId);
    }

    public Result<OrderShareResponse> resolveShareOrder(String token) {
        return orderShareHelper.resolveShareOrder(token);
    }

    public String resolveSharedStyleCover(String token) {
        return orderShareHelper.resolveSharedStyleCover(token);
    }

    public String generateOutstockShareToken(String customerName) {
        return outstockShareHelper.generateOutstockShareToken(customerName);
    }

    public Result<OutstockShareResponse> resolveOutstockShare(String token) {
        return outstockShareHelper.resolveOutstockShare(token);
    }
}
