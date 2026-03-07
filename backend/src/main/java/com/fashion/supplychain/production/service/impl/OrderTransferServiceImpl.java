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
import com.fashion.supplychain.system.dto.FactoryOrganizationSnapshot;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.helper.OrganizationUnitBindingHelper;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
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

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private OrganizationUnitBindingHelper organizationUnitBindingHelper;

    /** 备注时间戳格式 */
    private static final DateTimeFormatter REMARK_TIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

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

        // ✅ 租户隔离：只能转给同租户系统内部用户，禁止跨租户
        Long currentTenantId = UserContext.tenantId();
        if (currentTenantId != null && !currentTenantId.equals(toUser.getTenantId())) {
            throw new BusinessException("只能转移给本系统内部人员，禁止转移给外部用户");
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

        // ✅ 备注自动植入时间戳
        String timedMessage = buildTimedMessage(message);

        // 创建转移记录
        OrderTransfer transfer = new OrderTransfer();
        transfer.setOrderId(orderId);
        transfer.setFromUserId(currentUserId);
        transfer.setToUserId(toUserId);
        transfer.setTransferType("user");
        transfer.setStatus("pending");
        transfer.setMessage(timedMessage);
        transfer.setBundleIds(bundleIds);
        transfer.setProcessCodes(processCodes);
        transfer.setCreatedTime(LocalDateTime.now());
        transfer.setUpdatedTime(LocalDateTime.now());

        this.save(transfer);

        // 填充附加信息
        fillTransferInfo(transfer);

        log.info("创建订单转移请求(转人员): orderId={}, fromUserId={}, toUserId={}", orderId, currentUserId, toUserId);

        return transfer;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public OrderTransfer createTransferToFactory(String orderId, String toFactoryId, String message,
            String bundleIds, String processCodes) {
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

        // 验证目标工厂是否存在
        Factory toFactory = factoryService.getById(toFactoryId);
        if (toFactory == null) {
            throw new BusinessException("目标工厂不存在");
        }

        // ✅ 租户隔离：只能转给同租户系统内部工厂，禁止跨租户
        Long currentTenantId = UserContext.tenantId();
        if (currentTenantId != null && !currentTenantId.equals(toFactory.getTenantId())) {
            throw new BusinessException("只能转移给本系统内部工厂，禁止转移给外部工厂");
        }

        // 验证工厂状态是否启用
        if (!"active".equals(toFactory.getStatus())) {
            throw new BusinessException("目标工厂已停用，不能转移");
        }

        // 检查是否已有待处理的转移请求
        LambdaQueryWrapper<OrderTransfer> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(OrderTransfer::getOrderId, orderId)
                .eq(OrderTransfer::getStatus, "pending");
        long count = this.count(queryWrapper);
        if (count > 0) {
            throw new BusinessException("该订单已有待处理的转移请求");
        }

        // ✅ 备注自动植入时间戳
        String timedMessage = buildTimedMessage(message);

        // 工厂转单：直接生效（工厂没有系统账号，无法点"接受"，故由发起人确认即视为生效）
        OrderTransfer transfer = new OrderTransfer();
        transfer.setOrderId(orderId);
        transfer.setFromUserId(currentUserId);
        transfer.setTransferType("factory");
        transfer.setToFactoryId(toFactoryId);
        transfer.setToFactoryName(toFactory.getFactoryName());
        transfer.setStatus("accepted");   // ✅ 工厂转单直接生效
        transfer.setHandledTime(LocalDateTime.now());
        transfer.setMessage(timedMessage);
        transfer.setBundleIds(bundleIds);
        transfer.setProcessCodes(processCodes);
        transfer.setCreatedTime(LocalDateTime.now());
        transfer.setUpdatedTime(LocalDateTime.now());

        this.save(transfer);

        // ✅ 立即将订单工厂数据更新到 t_production_order
        applyTransferToOrder(transfer);

        // 填充附加信息
        fillTransferInfo(transfer);

        log.info("订单转工厂(直接生效): orderId={}, fromUserId={}, toFactoryId={}, toFactoryName={}",
                orderId, currentUserId, toFactoryId, toFactory.getFactoryName());

        return transfer;
    }

    /**
     * 构建带时间戳的备注
     * 格式: [2026-02-19 14:30] 备注内容
     */
    private String buildTimedMessage(String message) {
        String timestamp = "[" + LocalDateTime.now().format(REMARK_TIME_FMT) + "]";
        if (StringUtils.hasText(message)) {
            return timestamp + " " + message.trim();
        }
        return timestamp;
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
            // ✅ 人员转单：将订单责任人更新为接收人
            applyTransferToOrder(transfer);
            log.info("接受订单转移: transferId={}, orderId={}, toUserId={}",
                    transferId, transfer.getOrderId(), currentUserId);
        }

        return updated;
    }

    /**
     * 将转单结果应用到生产订单（核心数据迁移）
     * - 人员转单：更新 created_by_id / created_by_name
     * - 工厂转单：更新 factory_id / factory_name / factory_contact_person / factory_contact_phone
     */
    private void applyTransferToOrder(OrderTransfer transfer) {
        ProductionOrder order = productionOrderService.getById(transfer.getOrderId());
        if (order == null) {
            log.warn("applyTransferToOrder: 订单不存在, orderId={}", transfer.getOrderId());
            return;
        }

        if ("factory".equals(transfer.getTransferType())) {
            // 工厂转单：更新加工厂信息
            if (StringUtils.hasText(transfer.getToFactoryId())) {
                Factory factory = factoryService.getById(transfer.getToFactoryId());
                if (factory != null) {
                    order.setFactoryId(transfer.getToFactoryId());
                    order.setFactoryName(factory.getFactoryName());
                    order.setFactoryContactPerson(factory.getContactPerson());
                    order.setFactoryContactPhone(factory.getContactPhone());
                    FactoryOrganizationSnapshot snapshot = organizationUnitBindingHelper.getFactorySnapshot(factory);
                    order.setOrgUnitId(snapshot.getOrgUnitId());
                    order.setParentOrgUnitId(snapshot.getParentOrgUnitId());
                    order.setParentOrgUnitName(snapshot.getParentOrgUnitName());
                    order.setOrgPath(snapshot.getOrgPath());
                    order.setFactoryType(snapshot.getFactoryType());
                    productionOrderService.updateById(order);
                    log.info("[转单生效] 工厂更新: orderId={}, factoryId={}, factoryName={}",
                            order.getId(), factory.getId(), factory.getFactoryName());
                }
            }
        } else {
            // 人员转单：更新订单责任人
            if (transfer.getToUserId() != null) {
                User toUser = userService.getById(transfer.getToUserId());
                if (toUser != null) {
                    order.setCreatedById(String.valueOf(toUser.getId()));
                    order.setCreatedByName(toUser.getName());
                    productionOrderService.updateById(order);
                    log.info("[转单生效] 责任人更新: orderId={}, newUserId={}, newUserName={}",
                            order.getId(), toUser.getId(), toUser.getName());
                }
            }
        }
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

        // 转移类型区分填充
        String transferType = transfer.getTransferType();
        if ("factory".equals(transferType)) {
            // 工厂转单：to_factory_name 已存储在DB，无需额外填充
            // 若为空则尝试从工厂表补全
            if (!StringUtils.hasText(transfer.getToFactoryName())
                    && StringUtils.hasText(transfer.getToFactoryId())) {
                Factory factory = factoryService.getById(transfer.getToFactoryId());
                if (factory != null) {
                    transfer.setToFactoryName(factory.getFactoryName());
                }
            }
        } else {
            // 人员转单：填充接收人姓名（非DB字段）
            if (transfer.getToUserId() != null) {
                User toUser = userService.getById(transfer.getToUserId());
                if (toUser != null) {
                    transfer.setToUserName(toUser.getName());
                }
            }
        }
    }
}
