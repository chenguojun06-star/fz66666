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
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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

        return baseMapper.selectPage(pageInfo,
                new LambdaQueryWrapper<CuttingBundle>()
                        .eq(StringUtils.hasText(orderNo), CuttingBundle::getProductionOrderNo, orderNo)
                        .eq(StringUtils.hasText(styleNo), CuttingBundle::getStyleNo, styleNo)
                        .eq(StringUtils.hasText(color), CuttingBundle::getColor, color)
                        .eq(StringUtils.hasText(size), CuttingBundle::getSize, size)
                        .eq(StringUtils.hasText(status), CuttingBundle::getStatus, status)
                        .orderByAsc(CuttingBundle::getBundleNo));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<CuttingBundle> generateBundles(String orderId, List<Map<String, Object>> bundles) {
        // 支持订单号或订单ID查询
        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            // 如果按ID查不到，尝试按订单号查询
            order = productionOrderService.getByOrderNo(orderId);
        }
        if (order == null || bundles == null || bundles.isEmpty()) {
            log.warn("generateBundles: 订单未找到或参数为空, orderId={}", orderId);
            return new ArrayList<>();
        }
        log.info("generateBundles: 找到订单, orderNo={}, orderId={}", order.getOrderNo(), order.getId());

        int materialArrivalRate = order.getMaterialArrivalRate() == null ? 0 : order.getMaterialArrivalRate();
        if (materialArrivalRate < 100) {
            throw new IllegalStateException("物料未到齐，无法生成裁剪单");
        }

        CuttingTask task = cuttingTaskService.createTaskIfAbsent(order);
        if (task == null) {
            throw new NoSuchElementException("未找到裁剪任务");
        }
        if (!"received".equals(task.getStatus())) {
            if ("bundled".equals(task.getStatus())) {
                // 如果已生成过，先删除旧的菲号，允许重新生成
                log.info("订单已生成裁剪单，删除旧菲号重新生成: orderId={}", orderId);
                this.remove(new LambdaQueryWrapper<CuttingBundle>()
                        .eq(CuttingBundle::getProductionOrderId, order.getId()));
                // 重置任务状态为已领取，允许重新生成
                task.setStatus("received");
                cuttingTaskService.updateById(task);
            } else {
                throw new IllegalStateException("请先在裁剪任务中领取后再生成裁剪单");
            }
        }

        // 再次检查是否已存在菲号（防止并发）
        Long existingCount = this.count(new LambdaQueryWrapper<CuttingBundle>()
                .eq(CuttingBundle::getProductionOrderId, order.getId()));
        if (existingCount != null && existingCount > 0) {
            log.warn("订单菲号在生成过程中被创建: orderId={}", orderId);
        }

        List<CuttingBundle> result = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        int bundleIndex = 1;

        // ✅ 自动分配床号：
        // 优先复用同一订单已有的床号（同一订单多个尺码属于同一次裁剪），
        // 只有当前订单尚无任何bundles时，才从全局最大床号+1（新一床）
        Long currentTenantId = UserContext.tenantId();
        CuttingBundle sameOrderBundle = this.baseMapper.selectOne(
            new LambdaQueryWrapper<CuttingBundle>()
                .select(CuttingBundle::getBedNo)
                .eq(CuttingBundle::getProductionOrderId, order.getId())
                .isNotNull(CuttingBundle::getBedNo)
                .gt(CuttingBundle::getBedNo, 0)
                .orderByDesc(CuttingBundle::getBedNo)
                .last("LIMIT 1")
        );

        int nextBedNo;
        if (sameOrderBundle != null && sameOrderBundle.getBedNo() != null && sameOrderBundle.getBedNo() > 0) {
            // 同订单已有其他尺码的bundles → 复用同一床号（同一次裁剪）
            nextBedNo = sameOrderBundle.getBedNo();
            log.info("复用同订单床号: orderId={}, bedNo={}", order.getId(), nextBedNo);
        } else {
            // 订单首次生成bundles → 取全局最大床号+1（开始新一床）
            CuttingBundle lastBundle = this.baseMapper.selectOne(
                new LambdaQueryWrapper<CuttingBundle>()
                    .select(CuttingBundle::getBedNo)
                    .eq(CuttingBundle::getTenantId, currentTenantId)
                    .orderByDesc(CuttingBundle::getBedNo)
                    .last("LIMIT 1")
            );
            nextBedNo = (lastBundle != null && lastBundle.getBedNo() != null && lastBundle.getBedNo() > 0)
                        ? lastBundle.getBedNo() + 1
                        : 1;
            log.info("新建床号: tenantId={}, 本批床号={}, orderId={}", currentTenantId, nextBedNo, order.getId());
        }
        log.info("自动分配床号: tenantId={}, 本批床号={}, 本批扎号数={}", currentTenantId, nextBedNo, bundles.size());

        for (Map<String, Object> item : bundles) {
            String color = item.get("color") == null ? null : item.get("color").toString();
            String size = item.get("size") == null ? null : item.get("size").toString();

            // ✅ 新增验证：禁止包含逗号分隔的多尺码（如 "S,M,L,XL,XXL"）
            if (size != null && size.contains(",")) {
                throw new IllegalArgumentException(
                    "尺码字段不能包含逗号，请为每个尺码创建单独的菲号。" +
                    "错误值：" + size + "。" +
                    "正确做法：发送多个bundles项，每项包含单个尺码"
                );
            }

            Integer quantity = null;
            Object quantityObj = item.get("quantity");
            if (quantityObj != null) {
                try {
                    quantity = Integer.parseInt(quantityObj.toString());
                } catch (NumberFormatException e) {
                    log.warn("Invalid bundle quantity on generateBundles: orderId={}, value={}",
                            order == null ? null : order.getId(),
                            quantityObj,
                            e);
                }
            }

            if (quantity == null || quantity <= 0) {
                continue;
            }

            CuttingBundle bundle = new CuttingBundle();
            bundle.setProductionOrderId(order.getId());
            bundle.setProductionOrderNo(order.getOrderNo());
            bundle.setStyleId(order.getStyleId());
            bundle.setStyleNo(order.getStyleNo());
            bundle.setColor(color);
            bundle.setSize(size);
            bundle.setQuantity(quantity);
            bundle.setBundleNo(bundleIndex);
            bundle.setBedNo(nextBedNo); // ✅ 设置床号（按租户自动递增）

            String qrCode = buildQrCode(
                    StringUtils.hasText(order.getOrderNo()) ? order.getOrderNo() : order.getQrCode(),
                    order.getStyleNo(),
                    color,
                    size,
                    quantity,
                    bundleIndex);
            bundle.setQrCode(qrCode);
            bundle.setStatus("created");
            bundle.setCreateTime(now);
            bundle.setUpdateTime(now);

            result.add(bundle);
            bundleIndex++;
            // ❌ 不在此递增 bedNo：同一次裁剪操作的所有扎号共用同一个床号
            // nextBedNo 在下次调用 generateBundles 时才会 +1
        }

        if (!result.isEmpty()) {
            this.saveBatch(result);
            cuttingTaskService.markBundledByOrderId(order.getId());

            // ✅ 裁剪完成后生成工序跟踪记录（用于工资结算）
            try {
                processTrackingOrchestrator.initializeProcessTracking(order.getId());
                log.info("工序跟踪记录初始化成功: orderId={}, bundleCount={}", order.getId(), result.size());
            } catch (Exception e) {
                log.warn("工序跟踪记录初始化失败: orderId={}", order.getId(), e);
            }

            // 更新订单进度到下一阶段（车缝/缝制）
            try {
                order.setCurrentProcessName("车缝");
                order.setCuttingBundleCount(result.size());
                order.setUpdateTime(LocalDateTime.now());
                productionOrderService.updateById(order);
                log.info("裁剪菲号生成完成，订单进度已更新到车缝: orderId={}, orderNo={}, bundleCount={}",
                        order.getId(), order.getOrderNo(), result.size());
            } catch (Exception e) {
                log.warn("Failed to update order progress to sewing: orderId={}", order.getId(), e);
            }

            try {
                productionOrderService.recomputeProgressFromRecords(order.getId());
            } catch (Exception e) {
                log.warn("Failed to recompute progress after bundle generate: orderId={}", order.getId(), e);
            }
        }

        return result;
    }

    @Override
    public CuttingBundle getByQrCode(String qrCode) {
        if (!StringUtils.hasText(qrCode)) {
            return null;
        }
        return this.getOne(
                new LambdaQueryWrapper<CuttingBundle>()
                        .eq(CuttingBundle::getQrCode, qrCode)
                        .last("limit 1"));
    }

    @Override
    public CuttingBundle getByBundleNo(String orderNo, Integer bundleNo) {
        String on = StringUtils.hasText(orderNo) ? orderNo.trim() : null;
        int bn = bundleNo == null ? 0 : bundleNo.intValue();
        if (!StringUtils.hasText(on) || bn <= 0) {
            return null;
        }
        return this.getOne(new LambdaQueryWrapper<CuttingBundle>()
                .eq(CuttingBundle::getProductionOrderNo, on)
                .eq(CuttingBundle::getBundleNo, bn)
                .last("limit 1"));
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
}
