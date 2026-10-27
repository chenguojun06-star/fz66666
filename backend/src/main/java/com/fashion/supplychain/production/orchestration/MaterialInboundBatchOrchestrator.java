package com.fashion.supplychain.production.orchestration;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 采购批量登记到货编排器。
 *
 * <p>为什么单独一个 Bean：{@link MaterialInboundOrchestrator#confirmArrivalAndInbound} 带
 * {@code @Transactional}，若在同类内 this 调用不走 Spring 代理、事务失效。批量循环必须跨 Bean 调用，
 * 每条采购单才跑在自己的独立事务里 —— 单条失败只回滚该条，不影响其余条目。</p>
 *
 * <p>因此本类<b>不</b>加 {@code @Transactional}：外层无事务时，每次跨 Bean 调用都会开启新事务。</p>
 */
@Slf4j
@Service
public class MaterialInboundBatchOrchestrator {

    /** 单次批量上限（与前端批量选择规模对齐，防止一次请求打爆数据库连接） */
    private static final int MAX_BATCH_SIZE = 200;

    @Autowired
    private MaterialInboundOrchestrator materialInboundOrchestrator;

    /**
     * 批量登记到货。
     *
     * @param items 已解析条目，每项含 purchaseId(String) 与 arrivedQuantity(BigDecimal)
     * @return successCount / failCount / errors，与 batch-return-confirm 返回口径一致
     */
    public Map<String, Object> batchConfirmArrival(
            List<Map<String, Object>> items,
            String warehouseLocation,
            String operatorId,
            String operatorName,
            String remark) {
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("没有可登记到货的采购任务");
        }
        if (items.size() > MAX_BATCH_SIZE) {
            throw new IllegalArgumentException("单次批量登记最多 " + MAX_BATCH_SIZE + " 条，请分批操作");
        }

        int successCount = 0;
        List<String> errors = new ArrayList<>();
        for (Map<String, Object> item : items) {
            String purchaseId = String.valueOf(item.get("purchaseId"));
            BigDecimal arrivedQuantity = new BigDecimal(String.valueOf(item.get("arrivedQuantity")));
            try {
                materialInboundOrchestrator.confirmArrivalAndInbound(
                        purchaseId, arrivedQuantity, warehouseLocation, operatorId, operatorName, remark);
                successCount++;
            } catch (Exception e) {
                log.warn("批量登记到货失败: purchaseId={}, reason={}", purchaseId, e.getMessage());
                errors.add(purchaseId + ": " + e.getMessage());
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("successCount", successCount);
        result.put("failCount", errors.size());
        result.put("errors", errors);
        return result;
    }
}
