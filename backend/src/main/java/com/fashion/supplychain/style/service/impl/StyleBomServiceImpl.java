package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.mapper.StyleBomMapper;
import com.fashion.supplychain.style.service.StyleBomService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class StyleBomServiceImpl extends ServiceImpl<StyleBomMapper, StyleBom> implements StyleBomService {

    @Autowired
    private MaterialStockService materialStockService;

    @Override
    public List<StyleBom> listByStyleId(Long styleId) {
        return list(new LambdaQueryWrapper<StyleBom>().eq(StyleBom::getStyleId, styleId));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<StyleBom> saveBomWithStockCheck(List<StyleBom> bomList, Integer productionQty) {
        if (bomList == null || bomList.isEmpty()) {
            throw new RuntimeException("BOM列表不能为空");
        }

        if (productionQty == null || productionQty <= 0) {
            throw new RuntimeException("生产数量必须大于0");
        }

        log.info("开始保存BOM并检查库存: 款号ID={}, 生产数量={}, BOM条数={}",
                bomList.get(0).getStyleId(), productionQty, bomList.size());

        // 遍历每个BOM项，检查库存
        for (StyleBom bom : bomList) {
            // 1. 计算需求量（单件用量 × 生产数量 × (1 + 损耗率)）
            int requiredQty = calculateRequirement(bom, productionQty);

            // 2. 查询库存（按物料编码、颜色、尺码精确匹配）
            MaterialStock stock = findStock(bom);

            // 3. 计算可用库存
            int availableQty = 0;
            if (stock != null) {
                availableQty = (stock.getQuantity() != null ? stock.getQuantity() : 0)
                             - (stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0);
                availableQty = Math.max(0, availableQty); // 避免负数
            }

            // 4. 判断库存状态
            if (availableQty >= requiredQty) {
                bom.setStockStatus("sufficient");  // 充足
                bom.setRequiredPurchase(0);
            } else if (availableQty > 0) {
                bom.setStockStatus("insufficient"); // 不足
                bom.setRequiredPurchase(requiredQty - availableQty);
            } else {
                bom.setStockStatus("none");        // 无库存
                bom.setRequiredPurchase(requiredQty);
            }

            bom.setAvailableStock(availableQty);

            log.debug("BOM库存检查: 物料={}, 颜色={}, 需求={}, 可用={}, 状态={}, 需采购={}",
                    bom.getMaterialCode(), bom.getColor(), requiredQty, availableQty,
                    bom.getStockStatus(), bom.getRequiredPurchase());
        }

        // 5. 批量更新BOM（只更新已存在的记录，过滤掉id为空的）
        List<StyleBom> existingBoms = bomList.stream()
                .filter(bom -> bom.getId() != null && !bom.getId().trim().isEmpty())
                .collect(java.util.stream.Collectors.toList());

        if (!existingBoms.isEmpty()) {
            this.updateBatchById(existingBoms);
            log.info("BOM库存状态更新完成: 更新了{}条记录", existingBoms.size());
        } else {
            log.warn("BOM列表中没有已保存的记录，跳过更新");
        }

        return bomList;
    }

    @Override
    public Map<String, Object> getBomStockSummary(Long styleId, Integer productionQty) {
        List<StyleBom> bomList = listByStyleId(styleId);

        if (bomList.isEmpty()) {
            Map<String, Object> emptySummary = new HashMap<>();
            emptySummary.put("totalItems", 0);
            emptySummary.put("sufficientCount", 0);
            emptySummary.put("insufficientCount", 0);
            emptySummary.put("noneCount", 0);
            emptySummary.put("allSufficient", false);
            return emptySummary;
        }

        int totalItems = bomList.size();
        int sufficientCount = 0;
        int insufficientCount = 0;
        int noneCount = 0;
        int totalRequiredPurchase = 0;
        BigDecimal totalPurchaseValue = BigDecimal.ZERO;

        for (StyleBom bom : bomList) {
            // 如果没有库存状态，执行检查
            if (bom.getStockStatus() == null || "unchecked".equals(bom.getStockStatus())) {
                int requiredQty = calculateRequirement(bom, productionQty);
                MaterialStock stock = findStock(bom);
                int availableQty = 0;
                if (stock != null) {
                    availableQty = Math.max(0,
                            (stock.getQuantity() != null ? stock.getQuantity() : 0)
                                    - (stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0));
                }

                if (availableQty >= requiredQty) {
                    bom.setStockStatus("sufficient");
                    bom.setRequiredPurchase(0);
                } else if (availableQty > 0) {
                    bom.setStockStatus("insufficient");
                    bom.setRequiredPurchase(requiredQty - availableQty);
                } else {
                    bom.setStockStatus("none");
                    bom.setRequiredPurchase(requiredQty);
                }
                bom.setAvailableStock(availableQty);
            }

            // 统计
            switch (bom.getStockStatus()) {
                case "sufficient":
                    sufficientCount++;
                    break;
                case "insufficient":
                    insufficientCount++;
                    break;
                case "none":
                    noneCount++;
                    break;
            }

            // 累加需采购数量和金额
            if (bom.getRequiredPurchase() != null && bom.getRequiredPurchase() > 0) {
                totalRequiredPurchase += bom.getRequiredPurchase();
                if (bom.getUnitPrice() != null) {
                    BigDecimal purchaseValue = bom.getUnitPrice()
                            .multiply(BigDecimal.valueOf(bom.getRequiredPurchase()));
                    totalPurchaseValue = totalPurchaseValue.add(purchaseValue);
                }
            }
        }

        Map<String, Object> summary = new HashMap<>();
        summary.put("totalItems", totalItems);
        summary.put("sufficientCount", sufficientCount);
        summary.put("insufficientCount", insufficientCount);
        summary.put("noneCount", noneCount);
        summary.put("allSufficient", sufficientCount == totalItems);
        summary.put("totalRequiredPurchase", totalRequiredPurchase);
        summary.put("totalPurchaseValue", totalPurchaseValue);
        summary.put("bomList", bomList); // 包含详细清单

        return summary;
    }

    /**
     * 计算需求量
     * 公式：单件用量 × 生产数量 × (1 + 损耗率)
     */
    private int calculateRequirement(StyleBom bom, Integer productionQty) {
        if (bom.getUsageAmount() == null) {
            return 0;
        }

        BigDecimal usageAmount = bom.getUsageAmount();
        BigDecimal qty = BigDecimal.valueOf(productionQty);

        // 计算损耗系数 (1 + 损耗率/100)
        BigDecimal lossRate = bom.getLossRate() != null ? bom.getLossRate() : BigDecimal.ZERO;
        BigDecimal lossFactor = BigDecimal.ONE.add(lossRate.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP));

        // 需求量 = 单件用量 × 生产数量 × (1 + 损耗率)
        BigDecimal requirement = usageAmount.multiply(qty).multiply(lossFactor);

        // 向上取整
        return requirement.setScale(0, RoundingMode.UP).intValue();
    }

    /**
     * 查找库存记录
     * 按物料编码、颜色、尺码精确匹配
     */
    private MaterialStock findStock(StyleBom bom) {
        LambdaQueryWrapper<MaterialStock> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialStock::getMaterialCode, bom.getMaterialCode());

        // 颜色匹配（如果BOM有颜色要求）
        if (bom.getColor() != null && !bom.getColor().trim().isEmpty()) {
            wrapper.eq(MaterialStock::getColor, bom.getColor());
        }

        // 尺码/规格匹配（如果BOM有规格要求）
        if (bom.getSize() != null && !bom.getSize().trim().isEmpty()) {
            wrapper.eq(MaterialStock::getSize, bom.getSize());
        }

        List<MaterialStock> stockList = materialStockService.list(wrapper);

        if (stockList.isEmpty()) {
            return null;
        }

        // 如果有多条记录，返回库存最多的
        return stockList.stream()
                .max((s1, s2) -> {
                    int qty1 = (s1.getQuantity() != null ? s1.getQuantity() : 0)
                            - (s1.getLockedQuantity() != null ? s1.getLockedQuantity() : 0);
                    int qty2 = (s2.getQuantity() != null ? s2.getQuantity() : 0)
                            - (s2.getLockedQuantity() != null ? s2.getLockedQuantity() : 0);
                    return Integer.compare(qty1, qty2);
                })
                .orElse(null);
    }
}
