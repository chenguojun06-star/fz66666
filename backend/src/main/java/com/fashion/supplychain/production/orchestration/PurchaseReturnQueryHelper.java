package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.PurchaseReturn;
import com.fashion.supplychain.production.entity.PurchaseReturnItem;
import com.fashion.supplychain.production.service.PurchaseReturnItemService;
import com.fashion.supplychain.production.service.PurchaseReturnService;
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
 * 采购退货查询与工具辅助类（P2#10 拆分自 PurchaseReturnOrchestrator）
 * 职责：
 *   1. 退货单列表查询
 *   2. 退货单详情查询（含明细）
 *   3. 退货单号生成 + 审核备注结构化追加
 *
 * 设计原则：
 *   - 纯查询/工具方法，无 @Transactional
 *   - 不修改业务流程，不改 API 契约
 *   - 多租户隔离：所有查询带 tenant_id + delete_flag=0
 */
@Slf4j
@Component
public class PurchaseReturnQueryHelper {

    private static final DateTimeFormatter DATETIME_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    @Autowired
    private PurchaseReturnService purchaseReturnService;

    @Autowired
    private PurchaseReturnItemService purchaseReturnItemService;

    /**
     * 查询退货单列表（多租户隔离 + 软删除过滤）
     */
    public List<PurchaseReturn> listReturns(Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<PurchaseReturn> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PurchaseReturn::getTenantId, tenantId);
        wrapper.eq(PurchaseReturn::getDeleteFlag, 0);

        String originalPurchaseId = (String) params.get("originalPurchaseId");
        if (StringUtils.hasText(originalPurchaseId)) {
            wrapper.eq(PurchaseReturn::getOriginalPurchaseId, originalPurchaseId);
        }

        String returnStatus = (String) params.get("returnStatus");
        if (StringUtils.hasText(returnStatus)) {
            wrapper.eq(PurchaseReturn::getReturnStatus, returnStatus);
        }

        wrapper.orderByDesc(PurchaseReturn::getCreateTime);
        return purchaseReturnService.list(wrapper);
    }

    /**
     * 查询退货单详情（含明细，多租户隔离 + 软删除过滤）
     */
    public Map<String, Object> getReturnDetail(Long returnId) {
        Long tenantId = UserContext.tenantId();
        PurchaseReturn returnEntity = purchaseReturnService.lambdaQuery()
                .eq(PurchaseReturn::getId, returnId)
                .eq(PurchaseReturn::getTenantId, tenantId)
                .eq(PurchaseReturn::getDeleteFlag, 0)
                .one();
        if (returnEntity == null) {
            throw new IllegalArgumentException("退货单不存在或不属于当前租户");
        }

        List<PurchaseReturnItem> items = purchaseReturnItemService.list(
                new LambdaQueryWrapper<PurchaseReturnItem>()
                        .eq(PurchaseReturnItem::getTenantId, tenantId)
                        .eq(PurchaseReturnItem::getReturnId, returnId)
        );

        Map<String, Object> result = new HashMap<>();
        result.put("return", returnEntity);
        result.put("items", items);
        return result;
    }

    /**
     * 生成退货单号：PR+yyyyMMddHHmmss+4位随机数（P1#1: 防止高并发碰撞）
     */
    public String generateReturnNo() {
        String prefix = "PR";
        String datetime = LocalDateTime.now().format(DATETIME_FMT);
        int random = ThreadLocalRandom.current().nextInt(1000, 10000);
        return prefix + datetime + random;
    }

    /**
     * 结构化追加审核备注（P2#6）
     * 格式：[2026-07-04 12:00:00][张三][审核驳回] 备注内容
     * 多次审核会在新行追加，时间/操作人/动作清晰可辨，避免覆盖历史备注
     */
    public String appendAuditTrail(String existingRemark, String action, String operator, String reason) {
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String operatorName = operator != null ? operator : "系统";
        String entry = "[" + timestamp + "][" + operatorName + "][" + action + "] " + reason;
        if (existingRemark == null || existingRemark.isBlank()) {
            return entry;
        }
        return existingRemark + "\n" + entry;
    }
}
