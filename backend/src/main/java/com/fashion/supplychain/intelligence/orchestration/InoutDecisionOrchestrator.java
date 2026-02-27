package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.InoutRecommendRequest;
import com.fashion.supplychain.intelligence.dto.InoutRecommendResponse;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 出入库智能分流建议编排器
 *
 * <p><b>决策逻辑：</b>
 * <ol>
 *   <li>有待处理采购单 → SMART_RECEIVE_FIRST：引导调用 smart-receive-preview 自动分流</li>
 *   <li>无采购单 + 有需求数量 → OUTBOUND_FIRST：优先消耗现有库存</li>
 *   <li>只有订单号 → 默认 OUTBOUND_FIRST + 具体接口建议</li>
 * </ol>
 *
 * <p>本层负责解释性，实际分流执行依赖
 * {@code /api/production/purchase/smart-receive-all} 完成。
 */
@Service
public class InoutDecisionOrchestrator {

    public InoutRecommendResponse recommend(InoutRecommendRequest request) {
        InoutRecommendResponse response = new InoutRecommendResponse();

        if (request == null || !StringUtils.hasText(request.getOrderNo())) {
            response.setStrategy("PURCHASE");
            response.setReason("缺少订单号，无法计算库存优先策略");
            response.getSuggestions().add("请补充 orderNo 后重试");
            return response;
        }

        boolean hasPurchaseItems = request.getPurchaseIds() != null && !request.getPurchaseIds().isEmpty();

        if (hasPurchaseItems) {
            // 有待处理采购单 → 引导走智能分流路径
            response.setStrategy("SMART_RECEIVE_FIRST");
            response.setReason(String.format(
                    "检测到 %d 条待处理采购单（orderNo=%s）。" +
                    "建议优先调用 /api/production/purchase/smart-receive-preview 预览分流结果，" +
                    "系统将自动判断各面料批次是走现有库存还是新增入库。",
                    request.getPurchaseIds().size(), request.getOrderNo()));
            response.getSuggestions().add(
                    "POST /api/production/purchase/smart-receive-preview 详细分流计划");
            response.getSuggestions().add(
                    "确认无误后调用 POST /api/production/purchase/smart-receive-all 批量执行");
            response.getRelatedPurchaseIds().addAll(request.getPurchaseIds());
        } else {
            // 无采购单 → 优先消耗现有库存
            response.setStrategy("OUTBOUND_FIRST");
            response.setReason(String.format(
                    "订单 %s 当前无待处理采购单。" +
                    "建议优先从现有库存出库，减少资金占用；" +
                    "如库存不足，再按 BOM 生成采购建议。",
                    request.getOrderNo()));
            response.getSuggestions().add(
                    "GET /api/production/material/stock/list 查看当前面辅料库存");
            response.getSuggestions().add(
                    "POST /api/style/bom/generate-purchase 按 BOM 生成采购建议单");
        }

        return response;
    }
}
