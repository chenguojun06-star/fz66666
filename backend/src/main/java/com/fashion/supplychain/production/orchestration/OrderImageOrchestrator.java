package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.OrderImage;
import com.fashion.supplychain.production.entity.OrderImageSnapshot;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.OrderImageService;
import com.fashion.supplychain.production.service.OrderImageSnapshotService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
@Slf4j
public class OrderImageOrchestrator {

    private static final int MAX_IMAGES_PER_ORDER = 5;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Autowired
    private OrderImageService orderImageService;

    @Autowired
    private OrderImageSnapshotService orderImageSnapshotService;

    @Autowired
    private ProductionOrderService productionOrderService;

    public List<OrderImage> listByOrderNo(String orderNo) {
        Long tenantId = TenantAssert.requireTenantId();
        return orderImageService.lambdaQuery()
                .eq(OrderImage::getOrderNo, orderNo)
                .eq(OrderImage::getTenantId, tenantId)
                .eq(OrderImage::getDeleteFlag, 0)
                .orderByAsc(OrderImage::getSortOrder)
                .list();
    }

    @Transactional
    public OrderImage addImage(String orderNo, String imageUrl, String thumbnailUrl) {
        Long tenantId = TenantAssert.requireTenantId();
        long currentCount = orderImageService.lambdaQuery()
                .eq(OrderImage::getOrderNo, orderNo)
                .eq(OrderImage::getTenantId, tenantId)
                .eq(OrderImage::getDeleteFlag, 0)
                .last("FOR UPDATE")
                .count();
        if (currentCount >= MAX_IMAGES_PER_ORDER) {
            throw new RuntimeException("每单最多上传" + MAX_IMAGES_PER_ORDER + "张图片");
        }

        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getOrderNo, orderNo)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (order == null) {
            throw new RuntimeException("订单不存在: " + orderNo);
        }

        String beforeUrls = getCurrentUrlsJson(orderNo, tenantId);

        OrderImage image = new OrderImage();
        image.setOrderId(order.getId());
        image.setOrderNo(orderNo);
        image.setImageUrl(imageUrl);
        image.setThumbnailUrl(thumbnailUrl);
        image.setSortOrder((int) currentCount);
        image.setVersion(1);
        UserContext ctx = UserContext.get();
        if (ctx != null) {
            image.setOperatorId(ctx.getUserId());
            image.setOperatorName(ctx.getUsername());
        }
        image.setTenantId(tenantId);
        image.setCreateTime(LocalDateTime.now());
        image.setUpdateTime(LocalDateTime.now());
        image.setDeleteFlag(0);
        orderImageService.save(image);

        String afterUrls = getCurrentUrlsJson(orderNo, tenantId);
        createSnapshot(orderNo, "ADD", beforeUrls, afterUrls, tenantId);

        notifyImageUpdate(orderNo, tenantId);
        return image;
    }

    @Transactional
    public void deleteImage(Long imageId) {
        Long tenantId = TenantAssert.requireTenantId();
        OrderImage image = orderImageService.lambdaQuery()
                .eq(OrderImage::getId, imageId)
                .eq(OrderImage::getTenantId, tenantId)
                .eq(OrderImage::getDeleteFlag, 0)
                .one();
        if (image == null) {
            throw new RuntimeException("图片不存在");
        }

        String beforeUrls = getCurrentUrlsJson(image.getOrderNo(), tenantId);

        image.setDeleteFlag(1);
        image.setUpdateTime(LocalDateTime.now());
        UserContext ctx = UserContext.get();
        if (ctx != null) {
            image.setOperatorId(ctx.getUserId());
            image.setOperatorName(ctx.getUsername());
        }
        orderImageService.updateById(image);

        reorderImages(image.getOrderNo(), tenantId);

        String afterUrls = getCurrentUrlsJson(image.getOrderNo(), tenantId);
        createSnapshot(image.getOrderNo(), "DELETE", beforeUrls, afterUrls, tenantId);

        notifyImageUpdate(image.getOrderNo(), tenantId);
    }

    @Transactional
    public void reorderImages(String orderNo, List<Long> imageIds) {
        Long tenantId = TenantAssert.requireTenantId();
        String beforeUrls = getCurrentUrlsJson(orderNo, tenantId);

        for (int i = 0; i < imageIds.size(); i++) {
            orderImageService.lambdaUpdate()
                    .eq(OrderImage::getId, imageIds.get(i))
                    .eq(OrderImage::getTenantId, tenantId)
                    .set(OrderImage::getSortOrder, i)
                    .set(OrderImage::getUpdateTime, LocalDateTime.now())
                    .update();
        }

        String afterUrls = getCurrentUrlsJson(orderNo, tenantId);
        createSnapshot(orderNo, "REORDER", beforeUrls, afterUrls, tenantId);

        notifyImageUpdate(orderNo, tenantId);
    }

    public List<OrderImageSnapshot> listSnapshots(String orderNo) {
        Long tenantId = TenantAssert.requireTenantId();
        return orderImageSnapshotService.lambdaQuery()
                .eq(OrderImageSnapshot::getOrderNo, orderNo)
                .eq(OrderImageSnapshot::getTenantId, tenantId)
                .orderByDesc(OrderImageSnapshot::getCreateTime)
                .list();
    }

    private void reorderImages(String orderNo, Long tenantId) {
        List<OrderImage> images = orderImageService.lambdaQuery()
                .eq(OrderImage::getOrderNo, orderNo)
                .eq(OrderImage::getTenantId, tenantId)
                .eq(OrderImage::getDeleteFlag, 0)
                .orderByAsc(OrderImage::getSortOrder)
                .list();
        for (int i = 0; i < images.size(); i++) {
            images.get(i).setSortOrder(i);
        }
        orderImageService.updateBatchById(images);
    }

    private String getCurrentUrlsJson(String orderNo, Long tenantId) {
        List<String> urls = orderImageService.lambdaQuery()
                .select(OrderImage::getImageUrl)
                .eq(OrderImage::getOrderNo, orderNo)
                .eq(OrderImage::getTenantId, tenantId)
                .eq(OrderImage::getDeleteFlag, 0)
                .orderByAsc(OrderImage::getSortOrder)
                .list()
                .stream()
                .map(OrderImage::getImageUrl)
                .filter(StringUtils::hasText)
                .collect(Collectors.toList());
        try {
            return OBJECT_MAPPER.writeValueAsString(urls);
        } catch (Exception e) {
            return "[]";
        }
    }

    private void createSnapshot(String orderNo, String type, String beforeUrls, String afterUrls, Long tenantId) {
        OrderImageSnapshot snapshot = new OrderImageSnapshot();
        snapshot.setOrderNo(orderNo);
        snapshot.setSnapshotType(type);
        snapshot.setBeforeUrls(beforeUrls);
        snapshot.setAfterUrls(afterUrls);
        snapshot.setTenantId(tenantId);
        UserContext ctx = UserContext.get();
        if (ctx != null) {
            snapshot.setOperatorId(ctx.getUserId());
            snapshot.setOperatorName(ctx.getUsername());
        }
        snapshot.setCreateTime(LocalDateTime.now());
        orderImageSnapshotService.save(snapshot);
    }

    private void notifyImageUpdate(String orderNo, Long tenantId) {
        // 全局广播已移除，图片更新由操作者本地直接感知
    }
}
