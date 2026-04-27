package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.QrCodeSigner;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import lombok.extern.slf4j.Slf4j;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@Service
@Slf4j
public class CuttingBundleServiceImpl extends ServiceImpl<CuttingBundleMapper, CuttingBundle>
        implements CuttingBundleService {

    @Autowired
    @Lazy
    private ProductionOrderService productionOrderService;

    @Autowired
    private CuttingTaskService cuttingTaskService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    // NOTE [架构债务] Service不应调用Orchestrator
    // generateBundles()中的processTrackingOrchestrator调用+订单状态更新应迁移到CuttingBundleOrchestrator
    @Autowired
    @Lazy
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @Autowired
    private QrCodeSigner qrCodeSigner;

    @Override
    public IPage<CuttingBundle> queryPage(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);

        Page<CuttingBundle> pageInfo = new Page<>(page, pageSize);

        String orderNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "orderNo"));
        String styleNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "styleNo"));
        String color = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "color"));
        String size = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "size"));
        String status = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "status"));

        // 工厂账号隔离：通过 CuttingBundleOrchestrator 注入
        @SuppressWarnings("unchecked")
        List<String> factoryOrderNos = (List<String>) params.get("_factoryOrderNos");

        LambdaQueryWrapper<CuttingBundle> wrapper = new LambdaQueryWrapper<CuttingBundle>()
                .select(
                        CuttingBundle::getId,
                        CuttingBundle::getProductionOrderId,
                        CuttingBundle::getProductionOrderNo,
                        CuttingBundle::getStyleNo,
                        CuttingBundle::getColor,
                        CuttingBundle::getSize,
                        CuttingBundle::getBundleNo,
                        CuttingBundle::getBundleLabel,
                        CuttingBundle::getQuantity,
                        CuttingBundle::getBedNo,
                        CuttingBundle::getBedSubNo,
                        CuttingBundle::getQrCode,
                        CuttingBundle::getStatus,
                        CuttingBundle::getSplitStatus,
                        CuttingBundle::getCreateTime
                )
                .eq(StringUtils.hasText(orderNo), CuttingBundle::getProductionOrderNo, orderNo)
                .eq(StringUtils.hasText(styleNo), CuttingBundle::getStyleNo, styleNo)
                .eq(StringUtils.hasText(color), CuttingBundle::getColor, color)
                .eq(StringUtils.hasText(size), CuttingBundle::getSize, size)
                .eq(StringUtils.hasText(status), CuttingBundle::getStatus, status)
                .orderByAsc(CuttingBundle::getBundleNo);

        if (factoryOrderNos != null && !factoryOrderNos.isEmpty()) {
            wrapper.in(CuttingBundle::getProductionOrderNo, factoryOrderNos);
        }

        return baseMapper.selectPage(pageInfo, wrapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<CuttingBundle> generateBundles(String orderId, List<Map<String, Object>> bundles) {
        ProductionOrder order = resolveOrder(orderId);
        if (order == null || bundles == null || bundles.isEmpty()) {
            log.warn("generateBundles: 订单未找到或参数为空, orderId={}", orderId);
            return new ArrayList<>();
        }
        log.info("generateBundles: 找到订单, orderNo={}, orderId={}", order.getOrderNo(), order.getId());

        assertMaterialReady(order);
        CuttingTask task = resolveCuttingTask(order);

        Long existingCount = this.count(new LambdaQueryWrapper<CuttingBundle>()
                .eq(CuttingBundle::getProductionOrderId, order.getId()));
        int existingBundleCount = existingCount == null ? 0 : existingCount.intValue();

        int bundleIndex = resolveNextBundleIndex(order.getId());
        int[] bedInfo = resolveBedInfo(order.getId());
        int nextBedNo = bedInfo[0];
        Integer nextBedSubNo = bedInfo[1] > 0 ? bedInfo[1] : null;

        List<CuttingBundle> result = buildBundleList(order, bundles, nextBedNo, nextBedSubNo, bundleIndex);

        if (!result.isEmpty()) {
            this.saveBatch(result);
            cuttingTaskService.markBundledByOrderId(order.getId());
            registerProcessTrackingInitialization(order.getId(), result);
            updateOrderAfterBundleGenerate(order, existingBundleCount + result.size());
        }
        return result;
    }

    private ProductionOrder resolveOrder(String orderId) {
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getId, orderId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .one();
        if (order == null) {
            order = productionOrderService.getByOrderNo(orderId);
        }
        return order;
    }

    private void assertMaterialReady(ProductionOrder order) {
        boolean materialReady = materialPurchaseService.hasConfirmedQuantityByOrderId(order.getId(), true);
        if (!materialReady) {
            Integer rate = order.getMaterialArrivalRate();
            materialReady = rate != null && rate >= 100;
        }
        if (!materialReady) {
            materialReady = order.getProcurementManuallyCompleted() != null
                    && order.getProcurementManuallyCompleted() == 1;
        }
        if (!materialReady && StringUtils.hasText(order.getOrderNo())) {
            materialReady = order.getOrderNo().trim().toUpperCase().startsWith("CUT");
        }
        if (!materialReady) {
            throw new IllegalStateException("主面料尚未完成可裁确认，无法生成裁剪单");
        }
    }

    private CuttingTask resolveCuttingTask(ProductionOrder order) {
        CuttingTask task = cuttingTaskService.createTaskIfAbsent(order);
        if (task == null) {
            throw new NoSuchElementException("未找到裁剪任务");
        }
        String taskStatus = task.getStatus() == null ? "" : task.getStatus().trim();
        if (!"received".equals(taskStatus) && !"bundled".equals(taskStatus)) {
            throw new IllegalStateException("请先在裁剪任务中领取后再生成裁剪单");
        }
        return task;
    }

    private int resolveNextBundleIndex(String orderId) {
        CuttingBundle lastBundleNo = this.baseMapper.selectOne(
                new LambdaQueryWrapper<CuttingBundle>()
                        .select(CuttingBundle::getBundleNo)
                        .eq(CuttingBundle::getProductionOrderId, orderId)
                        .orderByDesc(CuttingBundle::getBundleNo)
                        .last("LIMIT 1"));
        if (lastBundleNo != null && lastBundleNo.getBundleNo() != null && lastBundleNo.getBundleNo() > 0) {
            return lastBundleNo.getBundleNo() + 1;
        }
        return 1;
    }

    private int[] resolveBedInfo(String orderId) {
        Long currentTenantId = UserContext.tenantId();
        CuttingBundle sameOrderBundle = this.baseMapper.selectOne(
            new LambdaQueryWrapper<CuttingBundle>()
                .select(CuttingBundle::getBedNo)
                .eq(CuttingBundle::getProductionOrderId, orderId)
                .isNotNull(CuttingBundle::getBedNo)
                .gt(CuttingBundle::getBedNo, 0)
                .orderByDesc(CuttingBundle::getBedNo)
                .last("LIMIT 1")
        );
        int nextBedNo;
        int nextBedSubNo = 0;
        if (sameOrderBundle != null && sameOrderBundle.getBedNo() != null && sameOrderBundle.getBedNo() > 0) {
            nextBedNo = sameOrderBundle.getBedNo();
            CuttingBundle maxSubBundle = this.baseMapper.selectOne(
                new LambdaQueryWrapper<CuttingBundle>()
                    .select(CuttingBundle::getBedSubNo)
                    .eq(CuttingBundle::getProductionOrderId, orderId)
                    .eq(CuttingBundle::getBedNo, nextBedNo)
                    .isNotNull(CuttingBundle::getBedSubNo)
                    .orderByDesc(CuttingBundle::getBedSubNo)
                    .last("LIMIT 1")
            );
            Integer currentMaxSub = (maxSubBundle != null) ? maxSubBundle.getBedSubNo() : null;
            nextBedSubNo = (currentMaxSub == null ? 0 : currentMaxSub) + 1;
            log.info("追加子床号: orderId={}, bedNo={}, bedSubNo={}", orderId, nextBedNo, nextBedSubNo);
        } else {
            CuttingBundle lastBundle = this.baseMapper.selectOne(
                new LambdaQueryWrapper<CuttingBundle>()
                    .select(CuttingBundle::getBedNo)
                    .eq(CuttingBundle::getTenantId, currentTenantId)
                    .orderByDesc(CuttingBundle::getBedNo)
                    .last("LIMIT 1")
            );
            nextBedNo = (lastBundle != null && lastBundle.getBedNo() != null && lastBundle.getBedNo() > 0)
                        ? lastBundle.getBedNo() + 1 : 1;
            log.info("新建床号: tenantId={}, 本批床号={}, orderId={}", currentTenantId, nextBedNo, orderId);
        }
        return new int[]{nextBedNo, nextBedSubNo};
    }

    private List<CuttingBundle> buildBundleList(ProductionOrder order, List<Map<String, Object>> bundles,
            int nextBedNo, Integer nextBedSubNo, int bundleIndex) {
        List<CuttingBundle> result = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        int idx = bundleIndex;
        for (Map<String, Object> item : bundles) {
            String color = item.get("color") == null ? null : item.get("color").toString();
            String size = item.get("size") == null ? null : item.get("size").toString();
            if (color != null) color = color.trim();
            if (size != null) size = size.trim();
            if (!StringUtils.hasText(color) || !StringUtils.hasText(size)) {
                throw new IllegalArgumentException("颜色和尺码不能为空，请为每个菲号指定颜色和尺码");
            }
            if (size.contains(",")) {
                throw new IllegalArgumentException(
                    "尺码字段不能包含逗号，请为每个尺码创建单独的菲号。错误值：" + size);
            }
            Integer quantity = parseBundleQuantity(item, order.getId());
            if (quantity == null || quantity <= 0) continue;

            CuttingBundle bundle = new CuttingBundle();
            bundle.setProductionOrderId(order.getId());
            bundle.setProductionOrderNo(order.getOrderNo());
            bundle.setStyleId(order.getStyleId());
            bundle.setStyleNo(order.getStyleNo());
            bundle.setColor(color);
            bundle.setSize(size);
            bundle.setQuantity(quantity);
            bundle.setBundleNo(idx);
            bundle.setBedNo(nextBedNo);
            bundle.setBedSubNo(nextBedSubNo);
            bundle.setQrCode(buildQrCode(
                    StringUtils.hasText(order.getOrderNo()) ? order.getOrderNo() : order.getQrCode(),
                    order.getStyleNo(), color, size, quantity, idx));
            bundle.setStatus("created");
            bundle.setCreateTime(now);
            bundle.setUpdateTime(now);
            result.add(bundle);
            idx++;
        }
        return result;
    }

    private Integer parseBundleQuantity(Map<String, Object> item, String orderId) {
        Object quantityObj = item.get("quantity");
        if (quantityObj != null) {
            try {
                return Integer.parseInt(quantityObj.toString());
            } catch (NumberFormatException e) {
                log.warn("Invalid bundle quantity on generateBundles: orderId={}, value={}", orderId, quantityObj, e);
            }
        }
        return null;
    }

    private void updateOrderAfterBundleGenerate(ProductionOrder order, int totalBundleCount) {
        try {
            order.setCurrentProcessName("车缝");
            order.setCuttingBundleCount(totalBundleCount);
            order.setUpdateTime(LocalDateTime.now());
            productionOrderService.updateById(order);
            log.info("裁剪菲号生成完成，订单进度已更新到车缝: orderId={}, orderNo={}, bundleCount={}",
                    order.getId(), order.getOrderNo(), totalBundleCount);
        } catch (Exception e) {
            log.warn("Failed to update order progress to sewing: orderId={}", order.getId(), e);
        }
        try {
            productionOrderService.recomputeProgressFromRecords(order.getId());
        } catch (Exception e) {
            log.warn("Failed to recompute progress after bundle generate: orderId={}", order.getId(), e);
        }
    }


    private void registerProcessTrackingInitialization(String orderId, List<CuttingBundle> bundles) {
        int bundleCount = bundles == null ? 0 : bundles.size();
        Runnable action = () -> {
            try {
                processTrackingOrchestrator.appendProcessTracking(orderId, bundles);
                log.info("工序跟踪记录初始化成功: orderId={}, bundleCount={}", orderId, bundleCount);
            } catch (Exception e) {
                log.warn("工序跟踪记录初始化失败: orderId={}", orderId, e);
            }
        };

        if (TransactionSynchronizationManager.isSynchronizationActive()
                && TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
            log.info("工序跟踪记录初始化已注册为事务后置动作: orderId={}, bundleCount={}", orderId, bundleCount);
            return;
        }

        action.run();
    }

    @Override
    public CuttingBundle getByQrCode(String qrCode) {
        if (!StringUtils.hasText(qrCode)) {
            return null;
        }
        CuttingBundle bundle = this.getOne(
                new LambdaQueryWrapper<CuttingBundle>()
                        .select(
                                CuttingBundle::getId, CuttingBundle::getProductionOrderId,
                                CuttingBundle::getProductionOrderNo, CuttingBundle::getStyleNo,
                                CuttingBundle::getColor, CuttingBundle::getSize,
                                CuttingBundle::getBundleNo, CuttingBundle::getBundleLabel,
                                CuttingBundle::getQuantity, CuttingBundle::getBedNo,
                                CuttingBundle::getBedSubNo, CuttingBundle::getQrCode,
                                CuttingBundle::getStatus, CuttingBundle::getSplitStatus,
                                CuttingBundle::getCreateTime)
                        .eq(CuttingBundle::getQrCode, qrCode)
                        .last("limit 1"));
        if (bundle != null) {
            return bundle;
        }
        int sigIndex = qrCode.lastIndexOf("|SIG-");
        if (sigIndex > 0) {
            String withoutSig = qrCode.substring(0, sigIndex);
            return this.getOne(
                    new LambdaQueryWrapper<CuttingBundle>()
                            .select(
                                    CuttingBundle::getId, CuttingBundle::getProductionOrderId,
                                    CuttingBundle::getProductionOrderNo, CuttingBundle::getStyleNo,
                                    CuttingBundle::getColor, CuttingBundle::getSize,
                                    CuttingBundle::getBundleNo, CuttingBundle::getBundleLabel,
                                    CuttingBundle::getQuantity, CuttingBundle::getBedNo,
                                    CuttingBundle::getBedSubNo, CuttingBundle::getQrCode,
                                    CuttingBundle::getStatus, CuttingBundle::getSplitStatus,
                                    CuttingBundle::getCreateTime)
                            .eq(CuttingBundle::getQrCode, withoutSig)
                            .last("limit 1"));
        }
        return null;
    }

    @Override
    public CuttingBundle getByBundleNo(String orderNo, Integer bundleNo) {
        String on = StringUtils.hasText(orderNo) ? orderNo.trim() : null;
        int bn = bundleNo == null ? 0 : bundleNo.intValue();
        if (!StringUtils.hasText(on) || bn <= 0) {
            return null;
        }
        // 优先返回非 split_parent 的记录（拆分后子菲号优先、未拆分菲号优先）
        return this.getOne(new LambdaQueryWrapper<CuttingBundle>()
                .select(
                        CuttingBundle::getId, CuttingBundle::getProductionOrderId,
                        CuttingBundle::getProductionOrderNo, CuttingBundle::getStyleNo,
                        CuttingBundle::getColor, CuttingBundle::getSize,
                        CuttingBundle::getBundleNo, CuttingBundle::getBundleLabel,
                        CuttingBundle::getQuantity, CuttingBundle::getBedNo,
                        CuttingBundle::getBedSubNo, CuttingBundle::getQrCode,
                        CuttingBundle::getStatus, CuttingBundle::getSplitStatus,
                        CuttingBundle::getCreateTime)
                .eq(CuttingBundle::getProductionOrderNo, on)
                .eq(CuttingBundle::getBundleNo, bn)
                .last("ORDER BY CASE WHEN split_status='split_parent' THEN 1 ELSE 0 END ASC LIMIT 1"));
    }

    @Override
    public Map<String, Object> summarize(String orderNo, String orderId) {
        String on = StringUtils.hasText(orderNo) ? orderNo.trim() : null;
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(on) && !StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }

        // 查询所有裁剪包
        LambdaQueryWrapper<CuttingBundle> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(
                CuttingBundle::getId, CuttingBundle::getProductionOrderId,
                CuttingBundle::getProductionOrderNo, CuttingBundle::getStyleNo,
                CuttingBundle::getColor, CuttingBundle::getSize,
                CuttingBundle::getBundleNo, CuttingBundle::getBundleLabel,
                CuttingBundle::getQuantity, CuttingBundle::getBedNo,
                CuttingBundle::getBedSubNo, CuttingBundle::getQrCode,
                CuttingBundle::getStatus, CuttingBundle::getSplitStatus,
                CuttingBundle::getCreateTime);
        if (StringUtils.hasText(on)) {
            wrapper.eq(CuttingBundle::getProductionOrderNo, on);
        }
        if (StringUtils.hasText(oid)) {
            wrapper.eq(CuttingBundle::getProductionOrderId, oid);
        }
        wrapper.orderByAsc(CuttingBundle::getBundleNo);

        List<CuttingBundle> bundles = this.list(wrapper);

        // 按颜色尺码分组
        Map<String, Map<String, Object>> groups = new java.util.LinkedHashMap<>();
        int totalQuantity = 0;

        for (CuttingBundle bundle : bundles) {
            String color = bundle.getColor() == null ? "" : bundle.getColor();
            String size = bundle.getSize() == null ? "" : bundle.getSize();
            int quantity = bundle.getQuantity() == null ? 0 : bundle.getQuantity();

            totalQuantity += quantity;

            String key = color + "|" + size;
            if (!groups.containsKey(key)) {
                Map<String, Object> group = new HashMap<>();
                group.put("color", color);
                group.put("size", size);
                group.put("quantity", quantity);
                group.put("bundleCount", 1);
                groups.put(key, group);
            } else {
                Map<String, Object> group = groups.get(key);
                int existingQty = (Integer) group.get("quantity");
                int existingCount = (Integer) group.get("bundleCount");
                group.put("quantity", existingQty + quantity);
                group.put("bundleCount", existingCount + 1);
            }
        }

        // 转换为列表
        List<Map<String, Object>> tasks = new ArrayList<>(groups.values());

        Map<String, Object> data = new HashMap<>();
        data.put("totalQuantity", totalQuantity);
        data.put("bundleCount", bundles.size());
        data.put("tasks", tasks); // 添加任务列表
        return data;
    }

    private String buildQrCode(String orderNo, String styleNo, String color, String size, int quantity, int bundleNo) {
        StringBuilder sb = new StringBuilder();
        if (StringUtils.hasText(orderNo)) {
            sb.append(orderNo);
        }
        sb.append("-");
        if (StringUtils.hasText(styleNo)) {
            sb.append(styleNo);
        }
        sb.append("-");
        if (StringUtils.hasText(color)) {
            sb.append(color);
        }
        sb.append("-");
        if (StringUtils.hasText(size)) {
            sb.append(size);
        }
        sb.append("-").append(Math.max(quantity, 0));
        sb.append("-").append(bundleNo);
        String base = sb.toString();
        String on = StringUtils.hasText(orderNo) ? orderNo.trim() : null;
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        String c = StringUtils.hasText(color) ? color.trim() : null;
        String s = StringUtils.hasText(size) ? size.trim() : null;
        String skuNo = null;
        if (StringUtils.hasText(on) && StringUtils.hasText(sn) && StringUtils.hasText(c) && StringUtils.hasText(s)) {
            skuNo = "SKU-" + on + "-" + sn + "-" + c + "-" + s;
        }
        String content;
        if (StringUtils.hasText(skuNo)) {
            content = base + "|" + skuNo;
        } else {
            content = base;
        }
        // 追加 HMAC 签名防伪
        return qrCodeSigner.sign(content);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteByOrderId(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return;
        }
        LambdaQueryWrapper<CuttingBundle> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CuttingBundle::getProductionOrderId, oid);
        baseMapper.delete(wrapper);
        log.info("Deleted cutting bundles for order: {}", oid);
    }
}
