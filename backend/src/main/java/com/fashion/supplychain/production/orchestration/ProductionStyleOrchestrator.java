package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;

/**
 * 生产与款式编排器
 *
 * 职责：协调production模块与style模块之间的数据流转
 * 实现生产订单与款式资料的跨模块编排
 */
@Slf4j
@Service
public class ProductionStyleOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private StyleInfoService styleInfoService;

    /**
     * 根据款式ID查询关联的生产订单列表
     *
     * @param styleId 款式ID
     * @return 生产订单列表
     */
    public List<ProductionOrder> listOrdersByStyleId(Long styleId) {
        if (styleId == null) {
            return List.of();
        }

        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getStyleId, styleId)
                .list();
    }

    /**
     * 根据款号查询关联的生产订单列表
     *
     * @param styleNo 款号
     * @return 生产订单列表
     */
    public List<ProductionOrder> listOrdersByStyleNo(String styleNo) {
        if (styleNo == null || styleNo.trim().isEmpty()) {
            return List.of();
        }

        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getStyleNo, styleNo.trim())
                .list();
    }

    /**
     * 获取生产订单的完整款式信息
     *
     * @param orderId 生产订单ID
     * @return 款式信息
     */
    public StyleInfo getStyleInfoByOrderId(String orderId) {
        if (orderId == null || orderId.trim().isEmpty()) {
            return null;
        }

        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null || order.getStyleId() == null) {
            return null;
        }

        return styleInfoService.getById(order.getStyleId());
    }

    /**
     * 同步款式信息到生产订单
     * 当款式信息变更时，同步更新关联的生产订单
     *
     * @param styleId 款式ID
     * @return 更新的订单数
     */
    @Transactional(rollbackFor = Exception.class)
    public int syncStyleInfoToOrders(Long styleId) {
        if (styleId == null) {
            return 0;
        }

        StyleInfo style = styleInfoService.getById(styleId);
        if (style == null) {
            throw new NoSuchElementException("款式不存在: " + styleId);
        }

        List<ProductionOrder> orders = listOrdersByStyleId(styleId);
        if (orders.isEmpty()) {
            log.info("款式 {} 没有关联的生产订单", styleId);
            return 0;
        }

        int updateCount = 0;
        for (ProductionOrder order : orders) {
            try {
                boolean updated = false;

                // 同步款式名称
                if (style.getStyleName() != null && !style.getStyleName().equals(order.getStyleName())) {
                    order.setStyleName(style.getStyleName());
                    updated = true;
                }

                // 同步款式图片
                if (style.getCover() != null && !style.getCover().equals(order.getStyleCover())) {
                    order.setStyleCover(style.getCover());
                    updated = true;
                }

                // 同步报价单价（如果订单单价未设置）
                if (order.getQuotationUnitPrice() == null && style.getPrice() != null) {
                    order.setQuotationUnitPrice(style.getPrice());
                    updated = true;
                }

                if (updated) {
                    productionOrderService.updateById(order);
                    updateCount++;
                }
            } catch (Exception e) {
                log.error("同步款式信息到订单失败: orderId={}", order.getId(), e);
            }
        }

        log.info("同步款式信息到生产订单完成: styleId={}, orderCount={}, updateCount={}",
                styleId, orders.size(), updateCount);

        return updateCount;
    }

    /**
     * 检查款式是否被生产订单引用
     *
     * @param styleId 款式ID
     * @return 是否被引用
     */
    public boolean isStyleReferencedByOrders(Long styleId) {
        if (styleId == null) {
            return false;
        }

        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getStyleId, styleId)
                .count() > 0;
    }

    /**
     * 获取引用款式的生产订单数量
     *
     * @param styleId 款式ID
     * @return 订单数量
     */
    public long countOrdersByStyleId(Long styleId) {
        if (styleId == null) {
            return 0;
        }

        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getStyleId, styleId)
                .count();
    }

    /**
     * 批量更新生产订单的款式信息
     *
     * @param styleId 款式ID
     * @param styleName 款式名称
     * @param styleCover 款式图片
     * @return 更新的订单数
     */
    @Transactional(rollbackFor = Exception.class)
    public int batchUpdateOrderStyleInfo(Long styleId, String styleName, String styleCover) {
        if (styleId == null) {
            return 0;
        }

        List<ProductionOrder> orders = listOrdersByStyleId(styleId);
        if (orders.isEmpty()) {
            return 0;
        }

        int updateCount = 0;
        for (ProductionOrder order : orders) {
            try {
                boolean updated = false;

                if (styleName != null && !styleName.equals(order.getStyleName())) {
                    order.setStyleName(styleName);
                    updated = true;
                }

                if (styleCover != null && !styleCover.equals(order.getStyleCover())) {
                    order.setStyleCover(styleCover);
                    updated = true;
                }

                if (updated) {
                    productionOrderService.updateById(order);
                    updateCount++;
                }
            } catch (Exception e) {
                log.error("批量更新订单款式信息失败: orderId={}", order.getId(), e);
            }
        }

        log.info("批量更新生产订单款式信息完成: styleId={}, updateCount={}", styleId, updateCount);

        return updateCount;
    }
}
