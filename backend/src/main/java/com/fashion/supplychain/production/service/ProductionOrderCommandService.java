package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.util.ProductionOrderUtils;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 生产订单命令服务
 * 处理订单的创建、更新、删除等命令操作
 */
@Service
@Slf4j
public class ProductionOrderCommandService {

    private final ProductionOrderService productionOrderService;
    private final StyleInfoService styleInfoService;

    @Autowired
    public ProductionOrderCommandService(
            ProductionOrderService productionOrderService,
            StyleInfoService styleInfoService) {
        this.productionOrderService = productionOrderService;
        this.styleInfoService = styleInfoService;
    }

    /**
     * 保存或更新订单
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean saveOrUpdateOrder(ProductionOrder productionOrder) {
        if (productionOrder == null) {
            throw new IllegalArgumentException("参数错误");
        }

        boolean isCreate = !StringUtils.hasText(productionOrder.getId());

        if (!isCreate) {
            String orderId = productionOrder.getId().trim();
            ProductionOrder existed = productionOrderService.getById(orderId);
            if (existed == null || existed.getDeleteFlag() != 0) {
                throw new NoSuchElementException("生产订单不存在");
            }

            String status = ProductionOrderUtils.safeText(existed.getStatus()).toLowerCase();
            if ("completed".equals(status)) {
                throw new IllegalStateException("订单已完成，无法编辑");
            }

            String remark = productionOrder.getOperationRemark();
            if (!StringUtils.hasText(remark)) {
                throw new IllegalStateException("请填写操作备注");
            }
        }

        // 设置基础字段
        LocalDateTime now = LocalDateTime.now();

        if (isCreate) {
            productionOrder.setCreateTime(now);
            productionOrder.setDeleteFlag(0);
            productionOrder.setStatus("not_started");
        } else {
            productionOrder.setUpdateTime(now);
        }

        // 保存订单
        boolean success = productionOrderService.saveOrUpdate(productionOrder);

        if (success && !isCreate) {
            log.info("订单[{}]被用户[{}]修改",
                    productionOrder.getOrderNo(), UserContext.username());
        }

        return success;
    }

    /**
     * 根据ID删除订单
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteById(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }

        ProductionOrder order = productionOrderService.getById(id.trim());
        if (order == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }

        // 检查订单状态
        String status = ProductionOrderUtils.safeText(order.getStatus()).toLowerCase();
        if ("completed".equals(status) || "in_progress".equals(status)) {
            throw new IllegalStateException("订单进行中或已完成，无法删除");
        }

        // 逻辑删除
        order.setDeleteFlag(1);
        order.setUpdateTime(LocalDateTime.now());

        return productionOrderService.updateById(order);
    }

    /**
     * 报废订单
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean scrapOrder(String id, String reason) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("报废原因不能为空");
        }

        ProductionOrder order = productionOrderService.getById(id.trim());
        if (order == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }

        // 检查订单状态
        String status = ProductionOrderUtils.safeText(order.getStatus()).toLowerCase();
        if ("completed".equals(status)) {
            throw new IllegalStateException("订单已完成，无法报废");
        }

        // 更新订单状态为报废
        order.setStatus("scrapped");
        order.setUpdateTime(LocalDateTime.now());

        return productionOrderService.updateById(order);
    }

    /**
     * 从样衣创建订单
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createOrderFromStyle(String styleId, String color, String size) {
        if (!StringUtils.hasText(styleId)) {
            throw new IllegalArgumentException("样衣ID不能为空");
        }

        StyleInfo style = styleInfoService.getById(styleId.trim());
        if (style == null) {
            throw new NoSuchElementException("样衣不存在");
        }

        // 创建新订单
        ProductionOrder order = new ProductionOrder();
        order.setStyleId(String.valueOf(style.getId()));
        order.setStyleNo(style.getStyleNo());
        order.setStyleName(style.getStyleName());
        order.setColor(StringUtils.hasText(color) ? color.trim() : "");
        order.setSize(StringUtils.hasText(size) ? size.trim() : "");
        order.setStatus("not_started");
        order.setDeleteFlag(0);
        order.setCreateTime(LocalDateTime.now());

        // 生成订单号
        String orderNo = generateOrderNo();
        order.setOrderNo(orderNo);

        boolean success = productionOrderService.save(order);

        Map<String, Object> result = new HashMap<>();
        result.put("success", success);
        result.put("orderId", order.getId());
        result.put("orderNo", orderNo);

        return result;
    }

    /**
     * 生成订单号
     */
    private String generateOrderNo() {
        // 格式：PO + 年月日 + 4位序号
        String prefix = "PO" + java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd").format(LocalDateTime.now());

        // 查询当天最大序号
        LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.likeRight(ProductionOrder::getOrderNo, prefix);
        wrapper.orderByDesc(ProductionOrder::getOrderNo);
        wrapper.last("limit 1");

        ProductionOrder lastOrder = productionOrderService.getOne(wrapper);
        int seq = 1;

        if (lastOrder != null && StringUtils.hasText(lastOrder.getOrderNo())) {
            String lastNo = lastOrder.getOrderNo();
            if (lastNo.length() >= prefix.length() + 4) {
                try {
                    seq = Integer.parseInt(lastNo.substring(prefix.length())) + 1;
                } catch (NumberFormatException e) {
                    seq = 1;
                }
            }
        }

        return prefix + String.format("%04d", seq);
    }
}
