package com.fashion.supplychain.production.dto.smart;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 单个订单的智能采购概览（已计算：缺料种数、预计金额、关键路径）
 *
 * <p>由 buildOverviewsBatch() 批量计算后返回，或从 Caffeine 缓存读出
 * <p>缓存 Key：smart-overview:{tenantId}:{orderNo}
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderOverviewDto {

    private String orderNo;

    /** 该订单 BOM 物料总数 */
    private int bomItemsCount;

    /** 缺料种数（净需求 > 0 的物料数） */
    private int shortageCount;

    /** 充足种数（净需求 <= 0 的物料数） */
    private int sufficientCount;

    /** 缺料预计金额 = Σ(净需求 × BOM单价) */
    private BigDecimal shortageAmount;

    /** BOM 总金额（用于参考对比） */
    private BigDecimal totalBomAmount;

    /** 关键缺料 TOP3（面料优先），例如：["梭织棉弹面料","涤纶里布"] */
    private List<String> criticalMaterials;

    /** 关键路径一句话描述，例如："面料缺2种，辅料缺3种（无法开裁）" / "全部充足" */
    private String criticalPath;

    /** 智能提示：供应商/价格/关键路径 等解释性信息 */
    private List<SourcingHint> hints;

    /** 计算时间（用于前端显示"XX分钟前更新"） */
    private LocalDateTime computedAt;

    /** 是否来自缓存（命中则前端显示缓存标识） */
    private boolean fromCache;
}
