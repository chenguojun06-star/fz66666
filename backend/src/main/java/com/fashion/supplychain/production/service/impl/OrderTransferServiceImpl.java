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
import com.fashion.supplychain.production.service.OrderTransferService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 订单转移Service实现类
 */
@Service
@Slf4j
public class OrderTransferServiceImpl extends ServiceImpl<OrderTransferMapper, OrderTransfer>
        implements OrderTransferService {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private UserService userService;

    /**
     * 获取当前登录用户ID
     */
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
    @Transactional(rollbackFor = Exception.class)
    public OrderTransfer createTransfer(String orderId, Long toUserId, String message, String bundleIds, String processCodes) {
        // 获取当前登录用户
        Long currentUserId = getCurrentUserId();
        if (currentUserId == null) {
            throw new BusinessException("未登录或登录已过期");
        }

        // 验证订单是否存在
        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            throw new BusinessException("订单不存在");
        }

        // 验证接收人是否存在
        User toUser = userService.getById(toUserId);
        if (toUser == null) {
            throw new BusinessException("接收人不存在");
        }

        // 不能转移给自己
        if (currentUserId.equals(toUserId)) {
            throw new BusinessException("不能转移订单给自己");
        }

        // 检查是否已有待处理的转移请求
        LambdaQueryWrapper<OrderTransfer> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(OrderTransfer::getOrderId, orderId)
                .eq(OrderTransfer::getStatus, "pending");
        long count = this.count(queryWrapper);
        if (count > 0) {
            throw new BusinessException("该订单已有待处理的转移请求");
        }

        // 创建转移记录
        OrderTransfer transfer = new OrderTransfer();
        transfer.setOrderId(orderId);
        transfer.setFromUserId(currentUserId);
        transfer.setToUserId(toUserId);
        transfer.setStatus("pending");
        transfer.setMessage(message);
        transfer.setBundleIds(bundleIds);
        transfer.setProcessCodes(processCodes);
        transfer.setCreatedTime(LocalDateTime.now());
        transfer.setUpdatedTime(LocalDateTime.now());

        this.save(transfer);

        // 填充附加信息
        fillTransferInfo(transfer);

        log.info("创建订单转移请求: orderId={}, fromUserId={}, toUserId={}", orderId, currentUserId, toUserId);

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

        // 填充附加信息
        pageResult.getRecords().forEach(this::fillTransferInfo);

        return pageResult;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean acceptTransfer(Long transferId) {
        Long currentUserId = getCurrentUserId();
        if (currentUserId == null) {
            throw new BusinessException("未登录或登录已过期");
        }

        OrderTransfer transfer = this.getById(transferId);
        if (transfer == null) {
            throw new BusinessException("转移请求不存在");
        }

        // 验证接收人
        if (!currentUserId.equals(transfer.getToUserId())) {
            throw new BusinessException("无权接受此转移请求");
        }

        // 验证状态
        if (!"pending".equals(transfer.getStatus())) {
            throw new BusinessException("该转移请求已处理");
        }

        // 更新转移状态
        transfer.setStatus("accepted");
        transfer.setHandledTime(LocalDateTime.now());
        transfer.setUpdatedTime(LocalDateTime.now());
        boolean updated = this.updateById(transfer);

        if (updated) {
            // 待完善：可在此补充订单责任人变更逻辑
            // 例如：更新订单的负责人字段
            log.info("接受订单转移: transferId={}, orderId={}, toUserId={}",
                    transferId, transfer.getOrderId(), currentUserId);
        }

        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean rejectTransfer(Long transferId, String rejectReason) {
        Long currentUserId = getCurrentUserId();
        if (currentUserId == null) {
            throw new BusinessException("未登录或登录已过期");
        }

        OrderTransfer transfer = this.getById(transferId);
        if (transfer == null) {
            throw new BusinessException("转移请求不存在");
        }

        // 验证接收人
        if (!currentUserId.equals(transfer.getToUserId())) {
            throw new BusinessException("无权拒绝此转移请求");
        }

        // 验证状态
        if (!"pending".equals(transfer.getStatus())) {
            throw new BusinessException("该转移请求已处理");
        }

        // 更新转移状态
        transfer.setStatus("rejected");
        transfer.setRejectReason(rejectReason);
        transfer.setHandledTime(LocalDateTime.now());
        transfer.setUpdatedTime(LocalDateTime.now());
        boolean updated = this.updateById(transfer);

        if (updated) {
            log.info("拒绝订单转移: transferId={}, orderId={}, reason={}",
                    transferId, transfer.getOrderId(), rejectReason);
        }

        return updated;
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

        // 填充附加信息
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

        // 填充附加信息
        pageResult.getRecords().forEach(this::fillTransferInfo);

        return pageResult;
    }

    /**
     * 填充转移记录的附加信息
     */
    private void fillTransferInfo(OrderTransfer transfer) {
        if (transfer == null) {
            return;
        }

        // 填充订单号
        if (StringUtils.hasText(transfer.getOrderId())) {
            ProductionOrder order = productionOrderService.getById(transfer.getOrderId());
            if (order != null) {
                transfer.setOrderNo(order.getOrderNo());
            }
        }

        // 填充发起人姓名
        if (transfer.getFromUserId() != null) {
            User fromUser = userService.getById(transfer.getFromUserId());
            if (fromUser != null) {
                transfer.setFromUserName(fromUser.getName());
            }
        }

        // 填充接收人姓名
        if (transfer.getToUserId() != null) {
            User toUser = userService.getById(transfer.getToUserId());
            if (toUser != null) {
                transfer.setToUserName(toUser.getName());
            }
        }
    }
}
