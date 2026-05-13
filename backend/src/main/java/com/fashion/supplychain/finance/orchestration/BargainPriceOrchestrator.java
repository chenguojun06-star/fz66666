package com.fashion.supplychain.finance.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.BargainPrice;
import com.fashion.supplychain.finance.service.BargainPriceService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.helper.OrderRemarkHelper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Component
public class BargainPriceOrchestrator {

    @Autowired
    private BargainPriceService bargainPriceService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private OrderRemarkHelper orderRemarkHelper;

    @Transactional(rollbackFor = Exception.class)
    public BargainPrice submit(BargainPrice bargainPrice) {
        TenantAssert.assertTenantContext();

        String userId = UserContext.userId();
        String username = UserContext.username();

        bargainPrice.setBargainedBy(userId);
        bargainPrice.setBargainedByName(username);
        bargainPrice.setStatus("pending");
        bargainPrice.setDeleteFlag(0);
        bargainPrice.setCreateTime(LocalDateTime.now());
        bargainPrice.setUpdateTime(LocalDateTime.now());

        bargainPriceService.save(bargainPrice);

        if ("order".equals(bargainPrice.getTargetType()) && StringUtils.hasText(bargainPrice.getTargetId())) {
            ProductionOrder order = productionOrderService.getById(bargainPrice.getTargetId());
            if (order != null) {
                String detail = "原始单价" + (bargainPrice.getOriginalPrice() != null ? bargainPrice.getOriginalPrice() : "-")
                        + "→" + (bargainPrice.getBargainedPrice() != null ? bargainPrice.getBargainedPrice() : "-")
                        + "，原因:" + (StringUtils.hasText(bargainPrice.getReason()) ? bargainPrice.getReason() : "无");
                orderRemarkHelper.append(order, "还价申请", detail);
            }
        }

        log.info("[BargainPrice] 还价提交成功: id={}, targetType={}, targetId={}, status=pending",
                bargainPrice.getId(), bargainPrice.getTargetType(), bargainPrice.getTargetId());
        return bargainPrice;
    }

    @Transactional(rollbackFor = Exception.class)
    public BargainPrice approve(Long id) {
        TenantAssert.assertTenantContext();

        BargainPrice bp = bargainPriceService.getById(id);
        if (bp == null) {
            throw new RuntimeException("还价记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(bp.getTenantId(), "还价记录");

        bp.setStatus("approved");
        bp.setApprovedBy(UserContext.userId());
        bp.setApprovedByName(UserContext.username());
        bp.setUpdateTime(LocalDateTime.now());
        bargainPriceService.updateById(bp);

        if ("order".equals(bp.getTargetType()) && StringUtils.hasText(bp.getTargetId()) && bp.getBargainedPrice() != null) {
            ProductionOrder latestOrder = productionOrderService.getById(bp.getTargetId());
            if (latestOrder != null) {
                String detail = "还价审批通过，单价" + (bp.getOriginalPrice() != null ? bp.getOriginalPrice() : "-")
                        + "→" + bp.getBargainedPrice();
                orderRemarkHelper.append(latestOrder, "还价审批", detail);

                ProductionOrder freshOrder = productionOrderService.getById(bp.getTargetId());
                freshOrder.setOrderUnitPrice(bp.getBargainedPrice());
                productionOrderService.updateById(freshOrder);
                log.info("[BargainPrice] 还价审批通过，订单 {} 单价更新为 {}",
                        freshOrder.getOrderNo(), bp.getBargainedPrice());
            }
        }

        log.info("[BargainPrice] 还价审批通过: id={}", id);
        return bp;
    }

    @Transactional(rollbackFor = Exception.class)
    public BargainPrice reject(Long id) {
        TenantAssert.assertTenantContext();

        BargainPrice bp = bargainPriceService.getById(id);
        if (bp == null) {
            throw new RuntimeException("还价记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(bp.getTenantId(), "还价记录");

        bp.setStatus("rejected");
        bp.setApprovedBy(UserContext.userId());
        bp.setApprovedByName(UserContext.username());
        bp.setUpdateTime(LocalDateTime.now());
        bargainPriceService.updateById(bp);

        log.info("[BargainPrice] 还价已拒绝: id={}", id);
        return bp;
    }

    public List<BargainPrice> listByTarget(String targetType, String targetId) {
        return bargainPriceService.listByTarget(targetType, targetId);
    }

    public BargainPrice getLatestApproved(String targetType, String targetId) {
        return bargainPriceService.getLatestApproved(targetType, targetId);
    }
}
