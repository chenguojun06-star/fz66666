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
     * D-890：直采使用（不进仓库）复用单条「登记到货」的同一后端实现
     * （confirm-complete + movementAction=direct_use），保证批量与单条逻辑完全一致。
     * 跨 Bean 调用同样保证每条独立事务。
     */
    @Autowired
    private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;

    /**
     * 批量登记到货（与单条「登记到货」同口径：每行可选入库到物料仓库 / 直采使用）。
     *
     * @param items 已解析条目，每项含 purchaseId(String)、arrivedQuantity(BigDecimal)、
     *              movementAction(String: inbound 默认 / direct_use)
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
            String movementAction = item.get("movementAction") == null
                    ? "inbound" : String.valueOf(item.get("movementAction")).trim();
            try {
                if ("direct_use".equals(movementAction)) {
                    // 直采使用：不进仓库、库存不变，完成采购并记一条采购直用流水（与单条完全同路径）
                    Map<String, Object> body = new LinkedHashMap<>();
                    body.put("purchaseId", purchaseId);
                    body.put("movementAction", "direct_use");
                    body.put("movementQuantity", arrivedQuantity);
                    body.put("receiverId", operatorId);
                    body.put("receiverName", operatorName);
                    body.put("remark", remark);
                    materialPurchaseOrchestrator.confirmComplete(body);
                } else {
                    materialInboundOrchestrator.confirmArrivalAndInbound(
                            purchaseId, arrivedQuantity, warehouseLocation, operatorId, operatorName, remark);
                }
                successCount++;
            } catch (Exception e) {
                log.warn("批量登记到货失败: purchaseId={}, movementAction={}, reason={}",
                        purchaseId, movementAction, e.getMessage());
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
