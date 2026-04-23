package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class DeliverySlaOrchestrator {

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    public void computeAndPersistSla(ProductionOrder order) {
        if (order == null) return;

        Integer actualDays = null;
        String slaStatus = null;

        if (order.getCreateTime() != null && order.getActualEndDate() != null) {
            actualDays = (int) ChronoUnit.DAYS.between(order.getCreateTime().toLocalDate(),
                    order.getActualEndDate().toLocalDate());
        } else if (order.getCreateTime() != null && order.getPlannedEndDate() != null) {
            long elapsed = ChronoUnit.DAYS.between(order.getCreateTime().toLocalDate(),
                    LocalDateTime.now().toLocalDate());
            actualDays = (int) elapsed;
        }

        if (actualDays != null && order.getStandardDeliveryDays() != null) {
            int std = order.getStandardDeliveryDays();
            if (order.getActualEndDate() != null) {
                slaStatus = actualDays <= std ? "completed" : "breached";
            } else if (actualDays > std) {
                slaStatus = "breached";
            } else if (actualDays >= std - 3) {
                slaStatus = "at_risk";
            } else {
                slaStatus = "on_track";
            }
        }

        if (actualDays != null || slaStatus != null) {
            ProductionOrder patch = new ProductionOrder();
            patch.setId(order.getId());
            patch.setActualDeliveryDays(actualDays);
            patch.setDeliverySlaStatus(slaStatus);
            productionOrderMapper.updateById(patch);
        }
    }

    public void batchRefreshSla() {
        try {
            TenantAssert.assertTenantContext();
            Long tenantId = UserContext.tenantId();
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.select("id", "create_time", "planned_end_date", "actual_end_date",
                    "standard_delivery_days", "status")
              .eq("tenant_id", tenantId)
              .eq("delete_flag", 0)
              .ne("status", "CANCELLED")
              .isNotNull("standard_delivery_days")
              .isNotNull("create_time")
              .last("LIMIT 500");
            List<ProductionOrder> list = productionOrderMapper.selectList(qw);
            for (ProductionOrder o : list) {
                computeAndPersistSla(o);
            }
            log.info("[交付SLA] 批量刷新完成: tenantId={}, count={}", tenantId, list.size());
        } catch (Exception e) {
            log.warn("[交付SLA] 批量刷新异常: {}", e.getMessage());
        }
    }
}
