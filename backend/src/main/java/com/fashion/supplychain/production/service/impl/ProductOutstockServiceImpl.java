package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductOutstockMapper;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.ThreadLocalRandom;
import lombok.extern.slf4j.Slf4j;
import com.fashion.supplychain.style.service.ProductSkuService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ProductOutstockServiceImpl extends ServiceImpl<ProductOutstockMapper, ProductOutstock>
        implements ProductOutstockService {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ProductSkuService productSkuService;

    @Override
    public IPage<ProductOutstock> queryPage(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);

        Page<ProductOutstock> pageInfo = new Page<>(page, pageSize);

        String outstockNo = (String) params.getOrDefault("outstockNo", "");
        String orderNo = (String) params.getOrDefault("orderNo", "");
        String styleNo = (String) params.getOrDefault("styleNo", "");
        String warehouse = (String) params.getOrDefault("warehouse", "");
        String outstockType = (String) params.getOrDefault("outstockType", "");

        LambdaQueryWrapper<ProductOutstock> wrapper = new LambdaQueryWrapper<ProductOutstock>()
                .eq(ProductOutstock::getDeleteFlag, 0)
                .like(StringUtils.hasText(outstockNo), ProductOutstock::getOutstockNo, outstockNo)
                .like(StringUtils.hasText(orderNo), ProductOutstock::getOrderNo, orderNo)
                .like(StringUtils.hasText(styleNo), ProductOutstock::getStyleNo, styleNo)
                .eq(StringUtils.hasText(warehouse), ProductOutstock::getWarehouse, warehouse)
                .eq(StringUtils.hasText(outstockType), ProductOutstock::getOutstockType, outstockType)
                .orderByDesc(ProductOutstock::getCreateTime);

        return baseMapper.selectPage(pageInfo, wrapper);
    }

    @Override
    public int sumOutstockByOrderId(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return 0;
        }
        try {
            java.util.List<ProductOutstock> list = this.list(new LambdaQueryWrapper<ProductOutstock>()
                    .eq(ProductOutstock::getOrderId, oid)
                    .eq(ProductOutstock::getDeleteFlag, 0));
            long sum = 0;
            if (list != null) {
                for (ProductOutstock o : list) {
                    if (o == null) {
                        continue;
                    }
                    int q = o.getOutstockQuantity() == null ? 0 : o.getOutstockQuantity();
                    if (q > 0) {
                        sum += q;
                    }
                }
            }
            return (int) Math.min(Integer.MAX_VALUE, Math.max(0, sum));
        } catch (Exception e) {
            return 0;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean saveOutstockAndValidate(ProductOutstock outstock) {
        LocalDateTime now = LocalDateTime.now();

        if (outstock == null || !StringUtils.hasText(outstock.getOrderId())) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        String oid = outstock.getOrderId().trim();

        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }

        int qty = outstock.getOutstockQuantity() == null ? 0 : outstock.getOutstockQuantity();
        if (qty <= 0) {
            throw new IllegalArgumentException("出库数量必须大于0");
        }

        int inboundQualified = productWarehousingService.sumQualifiedByOrderId(oid);
        int alreadyOut = sumOutstockByOrderId(oid);
        int available = Math.max(0, inboundQualified - alreadyOut);
        if (qty > available) {
            throw new IllegalStateException("可用库存不足");
        }

        if (!StringUtils.hasText(outstock.getOrderNo())) {
            outstock.setOrderNo(order.getOrderNo());
        }
        if (!StringUtils.hasText(outstock.getStyleId())) {
            outstock.setStyleId(order.getStyleId());
        }
        if (!StringUtils.hasText(outstock.getStyleNo())) {
            outstock.setStyleNo(order.getStyleNo());
        }
        if (!StringUtils.hasText(outstock.getStyleName())) {
            outstock.setStyleName(order.getStyleName());
        }
        if (!StringUtils.hasText(outstock.getOutstockNo())) {
            outstock.setOutstockNo(buildOutstockNo(now));
        }
        if (!StringUtils.hasText(outstock.getOutstockType())) {
            outstock.setOutstockType("shipment");
        }

        outstock.setCreateTime(now);
        outstock.setUpdateTime(now);
        outstock.setDeleteFlag(0);

        boolean saved = this.save(outstock);
        if (saved) {
            // 扣减SKU库存
            try {
                String styleNo = outstock.getStyleNo();
                String color = order.getColor();
                String size = order.getSize();
                if (StringUtils.hasText(styleNo) && StringUtils.hasText(color) && StringUtils.hasText(size)) {
                    String skuCode = String.format("%s-%s-%s", styleNo.trim(), color.trim(), size.trim());
                    productSkuService.updateStock(skuCode, -qty);
                }
            } catch (Exception e) {
                log.error("Failed to decrement stock for outstock: id={}, error={}", outstock.getId(), e.getMessage());
                throw new RuntimeException("库存扣减失败", e);
            }
        }
        return saved;
    }

    @Override
    public boolean softDeleteByOrderId(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            return false;
        }
        ProductOutstock patch = new ProductOutstock();
        patch.setDeleteFlag(1);
        patch.setUpdateTime(LocalDateTime.now());
        return this.update(patch, new LambdaUpdateWrapper<ProductOutstock>()
                .eq(ProductOutstock::getOrderId, orderId.trim())
                .eq(ProductOutstock::getDeleteFlag, 0));
    }

    private String buildOutstockNo(LocalDateTime now) {
        String ts = now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        int rand = (int) (ThreadLocalRandom.current().nextDouble() * 900) + 100;
        return "OS" + ts + rand;
    }
}
