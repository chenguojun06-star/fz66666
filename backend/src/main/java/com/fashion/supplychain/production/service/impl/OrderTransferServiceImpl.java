package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.OrderTransfer;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.OrderTransferMapper;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.OrderTransferService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionProcessTrackingService;
import com.fashion.supplychain.production.service.ScanRecordService;
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

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private CuttingTaskService cuttingTaskService;

    @Autowired
    private ProductionProcessTrackingService trackingService;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

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

        String status = order.getStatus();
        if (status != null && OrderStatusConstants.isTerminal(status)) {
            throw new BusinessException("订单已" + statusLabel(status) + "，不能转单");
        }

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
            String bundleIds, String processCodes, String processPriceOverrides) {
        Long currentUserId = getCurrentUserId();
        if (currentUserId == null) {
            throw new BusinessException("未登录或登录已过期");
        }

        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            throw new BusinessException("订单不存在");
        }

        Factory toFactory = factoryService.getById(toFactoryId);
        if (toFactory == null) {
            throw new BusinessException("目标工厂不存在");
        }

        Long currentTenantId = UserContext.tenantId();
        if (currentTenantId != null && !currentTenantId.equals(toFactory.getTenantId())) {
            throw new BusinessException("只能转移给本系统内部工厂，禁止转移给外部工厂");
        }

        if (!"active".equals(toFactory.getStatus())) {
            throw new BusinessException("目标工厂已停用，不能转移");
        }

        validateTransferEligibility(order, bundleIds);

        LambdaQueryWrapper<OrderTransfer> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(OrderTransfer::getOrderId, orderId)
                .eq(OrderTransfer::getStatus, "pending");
        long count = this.count(queryWrapper);
        if (count > 0) {
            throw new BusinessException("该订单已有待处理的转移请求");
        }

        String timedMessage = buildTimedMessage(message);

        OrderTransfer transfer = new OrderTransfer();
        transfer.setOrderId(orderId);
        transfer.setFromUserId(currentUserId);
        transfer.setTransferType("factory");
        transfer.setToFactoryId(toFactoryId);
        transfer.setToFactoryName(toFactory.getFactoryName());
        transfer.setStatus("accepted");
        transfer.setHandledTime(LocalDateTime.now());
        transfer.setMessage(timedMessage);
        transfer.setBundleIds(bundleIds);
        transfer.setProcessCodes(processCodes);
        transfer.setProcessPriceOverrides(processPriceOverrides);
        transfer.setCreatedTime(LocalDateTime.now());
        transfer.setUpdatedTime(LocalDateTime.now());

        this.save(transfer);

        applyTransferToOrder(transfer);

        fillTransferInfo(transfer);

        log.info("订单转工厂(直接生效): orderId={}, fromUserId={}, toFactoryId={}, toFactoryName={}, bundleIds={}, processCodes={}",
                orderId, currentUserId, toFactoryId, toFactory.getFactoryName(), bundleIds, processCodes);

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

        ProductionOrder order = productionOrderService.getById(transfer.getOrderId());
        if (order != null && "factory".equals(transfer.getTransferType())) {
            validateTransferEligibility(order, transfer.getBundleIds());
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
            if (StringUtils.hasText(transfer.getToFactoryId())) {
                Factory factory = factoryService.getById(transfer.getToFactoryId());
                if (factory != null) {
                    String targetFactoryId = transfer.getToFactoryId();
                    String targetFactoryName = factory.getFactoryName();
                    String targetFactoryType = factory.getFactoryType();

                    // 1. 更新订单工厂信息
                    order.setFactoryId(targetFactoryId);
                    order.setFactoryName(targetFactoryName);
                    order.setFactoryContactPerson(factory.getContactPerson());
                    order.setFactoryContactPhone(factory.getContactPhone());
                    FactoryOrganizationSnapshot snapshot = organizationUnitBindingHelper.getFactorySnapshot(factory);
                    order.setOrgUnitId(snapshot.getOrgUnitId());
                    order.setParentOrgUnitId(snapshot.getParentOrgUnitId());
                    order.setParentOrgUnitName(snapshot.getParentOrgUnitName());
                    order.setOrgPath(snapshot.getOrgPath());
                    order.setFactoryType(snapshot.getFactoryType());
                    productionOrderService.updateById(order);

                    // 2. 同步更新扫码记录工厂ID
                    syncScanRecordFactoryId(order.getId(), targetFactoryId, transfer.getBundleIds());

                    // 3. 同步更新裁剪任务和菲号的工厂ID（关键：支持菲号级工厂隔离）
                    syncCuttingDataFactoryId(order.getId(), targetFactoryId, targetFactoryName,
                            targetFactoryType, transfer.getBundleIds());

                    // 4. 应用工序单价覆盖
                    applyProcessPriceOverrides(transfer);

                    log.info("[转单生效] 工厂更新: orderId={}, factoryId={}, factoryName={}, bundleIds={}",
                            order.getId(), targetFactoryId, targetFactoryName, transfer.getBundleIds());
                }
            }
        } else {
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

    /**
     * 同步更新裁剪任务和菲号的工厂ID
     * @param orderId 订单ID
     * @param factoryId 目标工厂ID
     * @param factoryName 目标工厂名称
     * @param factoryType 目标工厂类型
     * @param bundleIds 指定的菲号ID列表（逗号分隔），null表示全部菲号
     */
    private void syncCuttingDataFactoryId(String orderId, String factoryId, String factoryName,
                                          String factoryType, String bundleIds) {
        if (!StringUtils.hasText(orderId) || !StringUtils.hasText(factoryId)) {
            return;
        }

        String normalizedFactoryType = factoryType != null ? factoryType.toUpperCase() : "EXTERNAL";

        // 1. 更新裁剪任务的 factoryId 和 factoryType
        try {
            List<CuttingTask> tasks = cuttingTaskService.list(
                    new LambdaQueryWrapper<CuttingTask>()
                            .eq(CuttingTask::getProductionOrderId, orderId));
            if (tasks != null && !tasks.isEmpty()) {
                for (CuttingTask task : tasks) {
                    task.setFactoryId(factoryId);
                    task.setFactoryType(normalizedFactoryType);
                }
                cuttingTaskService.updateBatchById(tasks);
                log.info("[转单同步] 裁剪任务工厂更新: orderId={}, factoryId={}, taskCount={}",
                        orderId, factoryId, tasks.size());
            }
        } catch (Exception e) {
            log.warn("[转单同步] 裁剪任务工厂更新失败: orderId={}, error={}", orderId, e.getMessage());
        }

        // 2. 更新菲号的 factoryId
        try {
            LambdaQueryWrapper<CuttingBundle> bundleQuery = new LambdaQueryWrapper<CuttingBundle>()
                    .eq(CuttingBundle::getProductionOrderId, orderId);

            // 如果指定了 bundleIds，只更新这些菲号（部分转单）
            if (StringUtils.hasText(bundleIds)) {
                List<String> targetBundleIds = java.util.Arrays.stream(bundleIds.split(","))
                        .map(String::trim)
                        .filter(StringUtils::hasText)
                        .distinct()
                        .collect(Collectors.toList());
                if (!targetBundleIds.isEmpty()) {
                    bundleQuery.in(CuttingBundle::getId, targetBundleIds);
                }
            }

            List<CuttingBundle> bundles = cuttingBundleService.list(bundleQuery);
            if (bundles != null && !bundles.isEmpty()) {
                for (CuttingBundle bundle : bundles) {
                    bundle.setFactoryId(factoryId);
                }
                cuttingBundleService.updateBatchById(bundles);
                log.info("[转单同步] 菲号工厂更新: orderId={}, factoryId={}, bundleCount={}",
                        orderId, factoryId, bundles.size());
            }
        } catch (Exception e) {
            log.warn("[转单同步] 菲号工厂更新失败: orderId={}, error={}", orderId, e.getMessage());
        }
    }

    private void applyProcessPriceOverrides(OrderTransfer transfer) {
        if (!StringUtils.hasText(transfer.getProcessPriceOverrides())) {
            return;
        }
        Map<String, Object> priceMap;
        try {
            priceMap = OBJECT_MAPPER.readValue(transfer.getProcessPriceOverrides(), Map.class);
        } catch (Exception e) {
            log.warn("[转单] 解析 processPriceOverrides 失败: {}", transfer.getProcessPriceOverrides(), e);
            return;
        }
        if (priceMap.isEmpty()) return;

        List<String> targetBundleIds = new ArrayList<>();
        if (StringUtils.hasText(transfer.getBundleIds())) {
            for (String id : transfer.getBundleIds().split(",")) {
                String bid = id.trim();
                if (!bid.isEmpty()) targetBundleIds.add(bid);
            }
        }

        LambdaQueryWrapper<ProductionProcessTracking> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(ProductionProcessTracking::getProductionOrderId, transfer.getOrderId());
        if (!targetBundleIds.isEmpty()) {
            queryWrapper.in(ProductionProcessTracking::getCuttingBundleId, targetBundleIds);
        }
        List<ProductionProcessTracking> trackings = trackingService.list(queryWrapper);

        List<ProductionProcessTracking> toUpdate = new ArrayList<>();
        for (ProductionProcessTracking tracking : trackings) {
            String processCode = tracking.getProcessCode();
            String processName = tracking.getProcessName();
            BigDecimal newPrice = null;

            if (StringUtils.hasText(processCode) && priceMap.containsKey(processCode)) {
                Object val = priceMap.get(processCode);
                if (val != null) {
                    try { newPrice = new BigDecimal(val.toString()); } catch (Exception ignored) {}
                }
            }
            if (newPrice == null && StringUtils.hasText(processName) && priceMap.containsKey(processName)) {
                Object val = priceMap.get(processName);
                if (val != null) {
                    try { newPrice = new BigDecimal(val.toString()); } catch (Exception ignored) {}
                }
            }

            if (newPrice != null && newPrice.compareTo(BigDecimal.ZERO) >= 0) {
                tracking.setUnitPrice(newPrice);
                int qty = tracking.getQuantity() != null ? tracking.getQuantity() : 0;
                tracking.setSettlementAmount(newPrice.multiply(BigDecimal.valueOf(qty)));
                toUpdate.add(tracking);
            }
        }

        if (!toUpdate.isEmpty()) {
            trackingService.updateBatchById(toUpdate);
            log.info("[转单] 已覆盖 {} 条 Tracking 记录的工序单价", toUpdate.size());
        }
    }

    private void validateTransferEligibility(ProductionOrder order, String bundleIds) {
        String status = order.getStatus();
        if (status != null && OrderStatusConstants.isTerminal(status)) {
            throw new BusinessException("订单已" + statusLabel(status) + "，不能转单");
        }

        List<ScanRecord> allScans = scanRecordService.listByCondition(order.getId(), null, null, "success", null);

        if (allScans.stream().anyMatch(item ->
                StringUtils.hasText(item.getPayrollSettlementId())
                        || "settled".equalsIgnoreCase(item.getSettlementStatus()))) {
            throw new BusinessException("该订单已有工资结算记录，不能转单");
        }

        if (allScans.stream().anyMatch(item -> "warehouse".equals(item.getScanType()))) {
            throw new BusinessException("该订单已有入库记录，不能转单");
        }

        if (StringUtils.hasText(bundleIds)) {
            String[] ids = bundleIds.split(",");
            for (String id : ids) {
                String bid = id.trim();
                List<ScanRecord> bundleScans = scanRecordService.listByCondition(order.getId(), bid, null, "success", null);
                if (!bundleScans.isEmpty()) {
                    CuttingBundle bundle = cuttingBundleService.getById(bid);
                    String label = bundle != null
                            ? (StringUtils.hasText(bundle.getBundleLabel()) ? bundle.getBundleLabel() : String.valueOf(bundle.getBundleNo()))
                            : bid;
                    throw new BusinessException("菲号 " + label + " 已有扫码登记记录，不能转单");
                }
            }
        } else {
            if (!allScans.isEmpty()) {
                throw new BusinessException("该订单已有 " + allScans.size() + " 条扫码登记记录，不能转单。如需转单，请选择未扫码的菲号");
            }
        }
    }

    private void syncScanRecordFactoryId(String orderId, String newFactoryId, String bundleIds) {
        Long tenantId = UserContext.tenantId();
        var query = scanRecordService.lambdaQuery()
                .eq(ScanRecord::getOrderId, orderId)
                .eq(tenantId != null, ScanRecord::getTenantId, tenantId)
                .ne(ScanRecord::getScanType, "orchestration");
        if (StringUtils.hasText(bundleIds)) {
            List<String> ids = new ArrayList<>();
            for (String bid : bundleIds.split(",")) {
                String trimmed = bid.trim();
                if (!trimmed.isEmpty()) ids.add(trimmed);
            }
            if (!ids.isEmpty()) {
                query.in(ScanRecord::getCuttingBundleId, ids);
            }
        }
        List<ScanRecord> records = query.list();
        if (records.isEmpty()) return;
        for (ScanRecord sr : records) {
            sr.setFactoryId(newFactoryId);
        }
        scanRecordService.updateBatchById(records);
        log.info("[转单] 已同步 {} 条扫码记录的factoryId → {}", records.size(), newFactoryId);
    }

    private String statusLabel(String status) {
        if (status == null) return "未知";
        switch (status.toLowerCase()) {
            case "producing": return "生产中";
            case "pending": return "待生产";
            case "completed": return "已完成";
            case "cancelled": return "已取消";
            case "scrapped": return "已报废";
            case "archived": return "已归档";
            case "closed": return "已关单";
            default: return status;
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
