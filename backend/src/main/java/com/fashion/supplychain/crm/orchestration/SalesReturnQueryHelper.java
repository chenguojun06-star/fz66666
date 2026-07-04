package com.fashion.supplychain.crm.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.crm.dto.SalesReturnItemRequest;
import com.fashion.supplychain.crm.entity.SalesReturn;
import com.fashion.supplychain.crm.entity.SalesReturnItem;
import com.fashion.supplychain.crm.service.SalesReturnItemService;
import com.fashion.supplychain.crm.service.SalesReturnService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 销售退货查询与工具辅助类（P2#10 拆分自 SalesReturnOrchestrator）
 * 职责：
 *   1. 退货单分页查询
 *   2. 退货单详情查询（含明细）
 *   3. 退货明细查询
 *   4. 退货单号生成 + 审核备注结构化追加 + 退货类型计算
 *
 * 设计原则：
 *   - 纯查询/工具方法，无 @Transactional
 *   - 不修改业务流程，不改 API 契约
 *   - 多租户隔离：所有查询带 tenant_id + delete_flag=0
 */
@Slf4j
@Component
public class SalesReturnQueryHelper {

    @Autowired
    private SalesReturnService salesReturnService;

    @Autowired
    private SalesReturnItemService salesReturnItemService;

    @Autowired
    private ProductionOrderService productionOrderService;

    /**
     * 分页查询退货单（多租户隔离 + 软删除过滤）
     */
    public IPage<SalesReturn> queryPage(Map<String, Object> params) {
        int page = parseInt(params.get("page"), 1);
        int pageSize = parseInt(params.get("pageSize"), 20);
        Long tenantId = TenantAssert.requireTenantId();

        LambdaQueryWrapper<SalesReturn> wrapper = new LambdaQueryWrapper<SalesReturn>()
                .eq(SalesReturn::getDeleteFlag, 0)
                .eq(SalesReturn::getTenantId, tenantId)
                .orderByDesc(SalesReturn::getCreateTime);

        String returnNo = (String) params.get("returnNo");
        if (StringUtils.hasText(returnNo)) {
            wrapper.like(SalesReturn::getReturnNo, returnNo);
        }
        String originalOrderNo = (String) params.get("originalOrderNo");
        if (StringUtils.hasText(originalOrderNo)) {
            wrapper.like(SalesReturn::getOriginalOrderNo, originalOrderNo);
        }
        String customerName = (String) params.get("customerName");
        if (StringUtils.hasText(customerName)) {
            wrapper.like(SalesReturn::getCustomerName, customerName);
        }
        String returnStatus = (String) params.get("returnStatus");
        if (StringUtils.hasText(returnStatus)) {
            wrapper.eq(SalesReturn::getReturnStatus, returnStatus);
        }

        return salesReturnService.page(new Page<>(page, pageSize), wrapper);
    }

    /**
     * 查询退货单详情（含明细，多租户隔离 + 软删除过滤）
     */
    public Map<String, Object> getDetailById(Long id) {
        Long tenantId = TenantAssert.requireTenantId();
        SalesReturn returnOrder = salesReturnService.lambdaQuery()
                .eq(SalesReturn::getId, id)
                .eq(SalesReturn::getTenantId, tenantId)
                .eq(SalesReturn::getDeleteFlag, 0)
                .one();
        if (returnOrder == null) {
            throw new IllegalArgumentException("退货单不存在或无权查看");
        }
        List<SalesReturnItem> items = salesReturnItemService.lambdaQuery()
                .eq(SalesReturnItem::getReturnId, id)
                .eq(SalesReturnItem::getTenantId, tenantId)
                .list();
        Map<String, Object> result = new HashMap<>();
        result.put("returnOrder", returnOrder);
        result.put("items", items);
        return result;
    }

    /**
     * 查询退货明细
     */
    public List<SalesReturnItem> getReturnItems(Long returnId) {
        Long tenantId = TenantAssert.requireTenantId();
        return salesReturnItemService.lambdaQuery()
                .eq(SalesReturnItem::getReturnId, returnId)
                .eq(SalesReturnItem::getTenantId, tenantId)
                .list();
    }

    /**
     * 生成退货单号：SR+yyyyMMddHHmmssSSS+3位随机数（P1#2: 防止同毫秒并发碰撞）
     */
    public String generateReturnNo() {
        return "SR" + DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS").format(LocalDateTime.now())
                + ThreadLocalRandom.current().nextInt(100, 1000);
    }

    /**
     * 结构化追加审核备注（P2#6）
     * 格式：[2026-07-04 12:00:00][张三][审核通过] 备注内容
     */
    public String appendAuditTrail(String existingRemark, String action, String operator, String reason) {
        String timestamp = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").format(LocalDateTime.now());
        String operatorName = operator != null ? operator : "系统";
        String entry = "[" + timestamp + "][" + operatorName + "][" + action + "] " + reason;
        if (existingRemark == null || existingRemark.isBlank()) {
            return entry;
        }
        return existingRemark + "\n" + entry;
    }

    /**
     * 计算退货类型：退货数量 >= 订单数量 → FULL，否则 PARTIAL
     */
    public String calculateReturnType(Long originalOrderId, List<SalesReturnItemRequest> items) {
        ProductionOrder order = productionOrderService.getById(originalOrderId);
        if (order == null) {
            return "PARTIAL";
        }
        Integer orderQty = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
        int returnQty = items.stream()
                .mapToInt(i -> i.getQuantity() != null ? i.getQuantity() : 0)
                .sum();
        return returnQty >= orderQty ? "FULL" : "PARTIAL";
    }

    private int parseInt(Object val, int def) {
        if (val == null) return def;
        try {
            return Integer.parseInt(val.toString());
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
