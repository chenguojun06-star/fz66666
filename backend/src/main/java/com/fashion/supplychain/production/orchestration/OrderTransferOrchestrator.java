package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
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

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 订单转移编排器
 * <p>
 * 编排跨域调用：订单转移 + 系统用户/工厂搜索
 * 安全约束：所有搜索严格限定在当前租户内（同租户隔离），禁止跨租户转移
 */
@Slf4j
@Service
public class OrderTransferOrchestrator {

    @Autowired
    private UserService userService;

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private ProductionOrderService productionOrderService;

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

    @Autowired
    private OrderTransferMapper orderTransferMapper;

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

    /**
     * 搜索可用用户（订单转移目标 — 仅限同租户系统内部用户）
     *
     * @param keyword  搜索关键词（姓名/用户名）
     * @param page     页码
     * @param pageSize 页大小
     * @return 用户列表（仅返回必要字段：id, name, username）
     */
    public Map<String, Object> searchTransferableUsers(String keyword, Long page, Long pageSize) {
        Long currentTenantId = UserContext.tenantId();

        LambdaQueryWrapper<User> queryWrapper = new LambdaQueryWrapper<>();

        // ✅ 租户隔离：只能搜索同租户用户
        if (currentTenantId != null) {
            queryWrapper.eq(User::getTenantId, currentTenantId);
        }

        if (StringUtils.hasText(keyword)) {
            queryWrapper.and(wrapper -> wrapper
                    .like(User::getName, keyword)
                    .or()
                    .like(User::getUsername, keyword));
        }

        queryWrapper.in(User::getStatus, Arrays.asList("active", "ENABLED"))
                .orderByAsc(User::getName);

        Page<User> userPage = userService.page(new Page<>(page, pageSize), queryWrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("total", userPage.getTotal());
        result.put("records", userPage.getRecords().stream().map(user -> {
            Map<String, Object> userInfo = new HashMap<>();
            userInfo.put("id", user.getId());
            userInfo.put("name", user.getName());
            userInfo.put("username", user.getUsername());
            return userInfo;
        }).toList());

        return result;
    }

    /**
     * 搜索可用工厂（订单转工厂 — 仅限同租户系统内部工厂）
     *
     * @param keyword  搜索关键词（工厂名称/编码）
     * @param page     页码
     * @param pageSize 页大小
     * @return 工厂列表（id, factoryCode, factoryName, contactPerson, contactPhone）
     */
    public Map<String, Object> searchTransferableFactories(String keyword, Long page, Long pageSize) {
        Long currentTenantId = UserContext.tenantId();

        LambdaQueryWrapper<Factory> queryWrapper = new LambdaQueryWrapper<>();

        // ✅ 租户隔离：只能搜索同租户工厂
        if (currentTenantId != null) {
            queryWrapper.eq(Factory::getTenantId, currentTenantId);
        }

        if (StringUtils.hasText(keyword)) {
            queryWrapper.and(wrapper -> wrapper
                    .like(Factory::getFactoryName, keyword)
                    .or()
                    .like(Factory::getFactoryCode, keyword));
        }

        // 只查启用状态的工厂
        queryWrapper.eq(Factory::getStatus, "active")
                .and(w -> w.eq(Factory::getDeleteFlag, 0).or().isNull(Factory::getDeleteFlag))
                .orderByAsc(Factory::getFactoryName);

        Page<Factory> factoryPage = factoryService.page(new Page<>(page, pageSize), queryWrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("total", factoryPage.getTotal());
        result.put("records", factoryPage.getRecords().stream().map(factory -> {
            Map<String, Object> factoryInfo = new HashMap<>();
            factoryInfo.put("id", factory.getId());
            factoryInfo.put("factoryCode", factory.getFactoryCode());
            factoryInfo.put("factoryName", factory.getFactoryName());
            factoryInfo.put("contactPerson", factory.getContactPerson());
            factoryInfo.put("contactPhone", factory.getContactPhone());
            return factoryInfo;
        }).toList());

        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public OrderTransfer createTransfer(String orderId, Long toUserId, String message, String bundleIds, String processCodes) {
        Long currentUserId = getCurrentUserId();
        if (currentUserId == null) {
            throw new BusinessException("未登录或登录已过期");
        }

        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            throw new BusinessException("订单不存在");
        }

        User toUser = userService.getById(toUserId);
        if (toUser == null) {
            throw new BusinessException("接收人不存在");
        }

        Long currentTenantId = UserContext.tenantId();
        if (!UserContext.isSuperAdmin()) {
            if (currentTenantId == null || !currentTenantId.equals(toUser.getTenantId())) {
                throw new BusinessException("只能转移给本系统内部人员，禁止转移给外部用户");
            }
        }

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
        Long count = orderTransferMapper.selectCount(queryWrapper);
        if (count != null && count > 0) {
            throw new BusinessException("该订单已有待处理的转移请求");
        }

        String timedMessage = buildTimedMessage(message);

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

        orderTransferMapper.insert(transfer);

        log.info("创建订单转移请求(转人员): orderId={}, fromUserId={}, toUserId={}", orderId, currentUserId, toUserId);

        return transfer;
    }

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
        if (!UserContext.isSuperAdmin()) {
            if (currentTenantId == null || !currentTenantId.equals(toFactory.getTenantId())) {
                throw new BusinessException("只能转移给本系统内部工厂，禁止转移给外部工厂");
            }
        }

        if (!"active".equals(toFactory.getStatus())) {
            throw new BusinessException("目标工厂已停用，不能转移");
        }

        validateTransferEligibility(order, bundleIds);

        LambdaQueryWrapper<OrderTransfer> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(OrderTransfer::getOrderId, orderId)
                .eq(OrderTransfer::getStatus, "pending");
        Long count = orderTransferMapper.selectCount(queryWrapper);
        if (count != null && count > 0) {
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

        orderTransferMapper.insert(transfer);

        applyTransferToOrder(transfer);

        log.info("订单转工厂(直接生效): orderId={}, fromUserId={}, toFactoryId={}, toFactoryName={}, bundleIds={}, processCodes={}",
                orderId, currentUserId, toFactoryId, toFactory.getFactoryName(), bundleIds, processCodes);

        return transfer;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean acceptTransfer(Long transferId) {
        Long currentUserId = getCurrentUserId();
        if (currentUserId == null) {
            throw new BusinessException("未登录或登录已过期");
        }

        OrderTransfer transfer = orderTransferMapper.selectById(transferId);
        if (transfer == null) {
            throw new BusinessException("转移请求不存在");
        }

        if (!currentUserId.equals(transfer.getToUserId())) {
            throw new BusinessException("无权接受此转移请求");
        }

        if (!"pending".equals(transfer.getStatus())) {
            throw new BusinessException("该转移请求已处理");
        }

        ProductionOrder order = productionOrderService.getById(transfer.getOrderId());
        if (order != null && "factory".equals(transfer.getTransferType())) {
            validateTransferEligibility(order, transfer.getBundleIds());
        }

        transfer.setStatus("accepted");
        transfer.setHandledTime(LocalDateTime.now());
        transfer.setUpdatedTime(LocalDateTime.now());
        int updated = orderTransferMapper.updateById(transfer);

        if (updated > 0) {
            applyTransferToOrder(transfer);
            log.info("接受订单转移: transferId={}, orderId={}, toUserId={}",
                    transferId, transfer.getOrderId(), currentUserId);
        }

        return updated > 0;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean rejectTransfer(Long transferId, String rejectReason) {
        Long currentUserId = getCurrentUserId();
        if (currentUserId == null) {
            throw new BusinessException("未登录或登录已过期");
        }

        OrderTransfer transfer = orderTransferMapper.selectById(transferId);
        if (transfer == null) {
            throw new BusinessException("转移请求不存在");
        }

        if (!currentUserId.equals(transfer.getToUserId())) {
            throw new BusinessException("无权拒绝此转移请求");
        }

        if (!"pending".equals(transfer.getStatus())) {
            throw new BusinessException("该转移请求已处理");
        }

        transfer.setStatus("rejected");
        transfer.setRejectReason(rejectReason);
        transfer.setHandledTime(LocalDateTime.now());
        transfer.setUpdatedTime(LocalDateTime.now());
        int updated = orderTransferMapper.updateById(transfer);

        if (updated > 0) {
            log.info("拒绝订单转移: transferId={}, orderId={}, reason={}",
                    transferId, transfer.getOrderId(), rejectReason);
        }

        return updated > 0;
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

    /**
     * 将转单结果应用到生产订单（核心数据迁移）
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

                    syncScanRecordFactoryId(order.getId(), targetFactoryId, transfer.getBundleIds());

                    syncCuttingDataFactoryId(order.getId(), targetFactoryId, targetFactoryName,
                            targetFactoryType, transfer.getBundleIds());

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
                    log.info("[转单生效] 领取人更新: orderId={}, newUserId={}, newUserName={}",
                            order.getId(), toUser.getId(), toUser.getName());
                }
            }
            String currentFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
            if (!StringUtils.hasText(currentFactoryId)) {
                String bundleIds = transfer.getBundleIds();
                log.info("[转单生效] 内部人员接受转单，清空菲号工厂归属: orderId={}, bundleIds={}",
                        order.getId(), bundleIds);
                clearBundleFactoryIds(order.getId(), bundleIds);
            }
        }
    }

    private void syncCuttingDataFactoryId(String orderId, String factoryId, String factoryName,
                                          String factoryType, String bundleIds) {
        if (!StringUtils.hasText(orderId) || !StringUtils.hasText(factoryId)) {
            return;
        }

        String normalizedFactoryType = factoryType != null ? factoryType.toUpperCase() : "EXTERNAL";

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
            log.error("[转单同步] 裁剪任务工厂更新失败: orderId={}, error={}", orderId, e.getMessage());
            throw new BusinessException("裁剪任务工厂同步失败，转单已回滚: " + e.getMessage());
        }

        try {
            LambdaQueryWrapper<CuttingBundle> bundleQuery = new LambdaQueryWrapper<CuttingBundle>()
                    .eq(CuttingBundle::getProductionOrderId, orderId);

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
            log.error("[转单同步] 菲号工厂更新失败: orderId={}, error={}", orderId, e.getMessage());
            throw new BusinessException("菲号工厂同步失败，转单已回滚: " + e.getMessage());
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

    private void clearBundleFactoryIds(String orderId, String bundleIds) {
        if (!StringUtils.hasText(orderId)) return;
        var query = cuttingBundleService.lambdaQuery().eq(CuttingBundle::getProductionOrderId, orderId);
        if (StringUtils.hasText(bundleIds)) {
            List<String> ids = new ArrayList<>();
            for (String bid : bundleIds.split(",")) {
                String trimmed = bid.trim();
                if (!trimmed.isEmpty()) ids.add(trimmed);
            }
            if (!ids.isEmpty()) {
                if (ids.size() == 1) {
                    query.eq(CuttingBundle::getId, ids.get(0));
                } else {
                    query.in(CuttingBundle::getId, ids);
                }
            }
        }
        List<CuttingBundle> bundles = query.list();
        if (bundles == null || bundles.isEmpty()) return;
        for (CuttingBundle b : bundles) {
            b.setFactoryId(null);
        }
        cuttingBundleService.updateBatchById(bundles);
        log.info("[转单-归回] 已清空 {} 个菲号的factoryId: orderId={}, bundleIds={}", bundles.size(), orderId, bundleIds);
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
}
