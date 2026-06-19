package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.OrderTransfer;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.OrderTransferMapper;
import com.fashion.supplychain.production.orchestration.OrderTransferOrchestrator;
import com.fashion.supplychain.production.service.OrderTransferService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Map;

/**
 * 订单转移Service实现类
 */
@Service
@Slf4j
public class OrderTransferServiceImpl extends ServiceImpl<OrderTransferMapper, OrderTransfer>
        implements OrderTransferService {

    @Autowired
    private OrderTransferOrchestrator orchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private UserService userService;

    @Autowired
    private FactoryService factoryService;

    private Long getCurrentUserId() {
        UserContext ctx = UserContext.get();
        if (ctx == null || ctx.getUserId() == null) {
            return null;
        }
        try {
            return Long.parseLong(ctx.getUserId());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @Override
    public OrderTransfer createTransfer(String orderId, Long toUserId, String message, String bundleIds, String processCodes) {
        OrderTransfer transfer = orchestrator.createTransfer(orderId, toUserId, message, bundleIds, processCodes);
        fillTransferInfo(transfer);
        return transfer;
    }

    @Override
    public OrderTransfer createTransferToFactory(String orderId, String toFactoryId, String message,
            String bundleIds, String processCodes, String processPriceOverrides) {
        OrderTransfer transfer = orchestrator.createTransferToFactory(orderId, toFactoryId, message,
                bundleIds, processCodes, processPriceOverrides);
        fillTransferInfo(transfer);
        return transfer;
    }

    @Override
    public IPage<OrderTransfer> queryPendingTransfers(Map<String, Object> params) {
        Long currentUserId = getCurrentUserId();
        if (currentUserId == null) {
            throw new BusinessException("未登录或登录已过期");
        }

        int page = Integer.parseInt(params.getOrDefault("page", "1").toString());
        int pageSize = Integer.parseInt(params.getOrDefault("pageSize", "10").toString());

        LambdaQueryWrapper<OrderTransfer> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(OrderTransfer::getToUserId, currentUserId)
                .eq(OrderTransfer::getStatus, "pending")
                .orderByDesc(OrderTransfer::getCreatedTime);

        Page<OrderTransfer> pageResult = this.page(new Page<>(page, pageSize), queryWrapper);

        pageResult.getRecords().forEach(this::fillTransferInfo);

        return pageResult;
    }

    @Override
    public boolean acceptTransfer(Long transferId) {
        return orchestrator.acceptTransfer(transferId);
    }

    @Override
    public boolean rejectTransfer(Long transferId, String rejectReason) {
        return orchestrator.rejectTransfer(transferId, rejectReason);
    }

    @Override
    public IPage<OrderTransfer> queryMyTransfers(Map<String, Object> params) {
        Long currentUserId = getCurrentUserId();
        if (currentUserId == null) {
            throw new BusinessException("未登录或登录已过期");
        }

        int page = Integer.parseInt(params.getOrDefault("page", "1").toString());
        int pageSize = Integer.parseInt(params.getOrDefault("pageSize", "10").toString());

        LambdaQueryWrapper<OrderTransfer> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(OrderTransfer::getFromUserId, currentUserId)
                .orderByDesc(OrderTransfer::getCreatedTime);

        Page<OrderTransfer> pageResult = this.page(new Page<>(page, pageSize), queryWrapper);

        pageResult.getRecords().forEach(this::fillTransferInfo);

        return pageResult;
    }

    @Override
    public IPage<OrderTransfer> queryReceivedTransfers(Map<String, Object> params) {
        Long currentUserId = getCurrentUserId();
        if (currentUserId == null) {
            throw new BusinessException("未登录或登录已过期");
        }

        int page = Integer.parseInt(params.getOrDefault("page", "1").toString());
        int pageSize = Integer.parseInt(params.getOrDefault("pageSize", "10").toString());
        String status = (String) params.get("status");

        LambdaQueryWrapper<OrderTransfer> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(OrderTransfer::getToUserId, currentUserId);

        if (StringUtils.hasText(status)) {
            queryWrapper.eq(OrderTransfer::getStatus, status);
        }

        queryWrapper.orderByDesc(OrderTransfer::getCreatedTime);

        Page<OrderTransfer> pageResult = this.page(new Page<>(page, pageSize), queryWrapper);

        pageResult.getRecords().forEach(this::fillTransferInfo);

        return pageResult;
    }

    private void fillTransferInfo(OrderTransfer transfer) {
        if (transfer == null) {
            return;
        }

        if (StringUtils.hasText(transfer.getOrderId())) {
            ProductionOrder order = productionOrderService.getById(transfer.getOrderId());
            if (order != null) {
                transfer.setOrderNo(order.getOrderNo());
            }
        }

        if (transfer.getFromUserId() != null) {
            User fromUser = userService.getById(transfer.getFromUserId());
            if (fromUser != null) {
                transfer.setFromUserName(fromUser.getName());
            }
        }

        String transferType = transfer.getTransferType();
        if ("factory".equals(transferType)) {
            if (!StringUtils.hasText(transfer.getToFactoryName())
                    && StringUtils.hasText(transfer.getToFactoryId())) {
                Factory factory = factoryService.getById(transfer.getToFactoryId());
                if (factory != null) {
                    transfer.setToFactoryName(factory.getFactoryName());
                }
            }
        } else {
            if (transfer.getToUserId() != null) {
                User toUser = userService.getById(transfer.getToUserId());
                if (toUser != null) {
                    transfer.setToUserName(toUser.getName());
                }
            }
        }
    }
}
