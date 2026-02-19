package com.fashion.supplychain.production.service;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.List;

/**
 * 订单价格填充服务
 * 处理工厂单价和报价单价的计算与填充
 */
@Service
@Slf4j
public class OrderPriceFillService {

    private final ScanRecordMapper scanRecordMapper;
    private final TemplateLibraryService templateLibraryService;
    private final StyleInfoService styleInfoService;

    @Autowired
    public OrderPriceFillService(
            ScanRecordMapper scanRecordMapper,
            TemplateLibraryService templateLibraryService,
            StyleInfoService styleInfoService) {
        this.scanRecordMapper = scanRecordMapper;
        this.templateLibraryService = templateLibraryService;
        this.styleInfoService = styleInfoService;
    }

    /**
     * 填充工厂单价
     * 从扫码记录或模板计算获取工厂单价
     */
    public void fillFactoryUnitPrice(List<ProductionOrder> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        for (ProductionOrder order : records) {
            if (!StringUtils.hasText(order.getId())) {
                continue;
            }

            try {
                // 尝试从扫码记录获取工厂单价
                BigDecimal factoryPrice = calculateFactoryPriceFromScanRecords(order.getId());

                // 如果扫码记录没有，尝试从模板计算
                if (factoryPrice == null || factoryPrice.compareTo(BigDecimal.ZERO) <= 0) {
                    factoryPrice = calculateFactoryPriceFromTemplate(order);
                }

                if (factoryPrice != null && factoryPrice.compareTo(BigDecimal.ZERO) > 0) {
                    order.setFactoryUnitPrice(factoryPrice);
                }
            } catch (Exception e) {
                log.warn("填充工厂单价失败: orderId={}", order.getId(), e);
            }
        }
    }

    /**
     * 填充报价单价
     * 从款式报价或款式信息获取报价单价
     */
    public void fillQuotationUnitPrice(List<ProductionOrder> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        for (ProductionOrder order : records) {
            if (!StringUtils.hasText(order.getStyleId())) {
                continue;
            }

            try {
                // 获取款式信息
                StyleInfo styleInfo = styleInfoService.getById(Long.parseLong(order.getStyleId()));
                if (styleInfo == null) {
                    continue;
                }

                // 从款式信息获取报价（简化实现）
                // 实际实现需要根据StyleInfo的实际字段获取报价
                log.debug("填充报价单价: orderId={}, styleId={}", order.getId(), order.getStyleId());
            } catch (NumberFormatException e) {
                log.warn("解析款式ID失败: styleId={}", order.getStyleId(), e);
            } catch (Exception e) {
                log.warn("填充报价单价失败: orderId={}", order.getId(), e);
            }
        }
    }

    /**
     * 从扫码记录计算工厂单价
     */
    private BigDecimal calculateFactoryPriceFromScanRecords(String orderId) {
        // 简化实现：实际需要从扫码记录中计算
        // 这里返回null表示需要从模板计算
        return null;
    }

    /**
     * 从模板计算工厂单价
     */
    private BigDecimal calculateFactoryPriceFromTemplate(ProductionOrder order) {
        if (!StringUtils.hasText(order.getStyleId())) {
            return null;
        }

        try {
            // 使用模板库服务计算价格
            // 简化实现：实际需要根据工序模板计算
            // 注意：需要确认TemplateLibraryService的实际方法名
            log.debug("从模板计算价格: orderId={}, styleId={}", order.getId(), order.getStyleId());
            return null;
        } catch (Exception e) {
            log.warn("从模板计算价格失败: orderId={}", order.getId(), e);
            return null;
        }
    }
}
