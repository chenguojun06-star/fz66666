package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.dto.AiScanTipResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

@Service
@Slf4j
public class ScanTipsOrchestrator {

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private StyleInfoMapper styleInfoMapper;

    public AiScanTipResponse getScanTips(String orderNo, String processName) {
        AiScanTipResponse response = new AiScanTipResponse();
        response.setOrderNo(orderNo);
        response.setProcessName(processName);
        response.setKeywords(new ArrayList<>());

        if (!StringUtils.hasText(orderNo)) {
            return response;
        }

        ProductionOrder order = productionOrderMapper.selectOne(
            new LambdaQueryWrapper<ProductionOrder>().eq(ProductionOrder::getOrderNo, orderNo)
        );

        if (order == null) {
            return response;
        }

        StyleInfo style = null;
        if (StringUtils.hasText(order.getStyleNo())) {
            style = styleInfoMapper.selectOne(
                new LambdaQueryWrapper<StyleInfo>()
                    .eq(StyleInfo::getStyleNo, order.getStyleNo())
                    .last("LIMIT 1")
            );
        }

        StringBuilder tipBuilder = new StringBuilder();
        List<String> keywords = new ArrayList<>();

        // 分析款式或面料名称 (智能预置规则)
        String styleName = order.getStyleName() != null ? order.getStyleName() : "";
        if (styleName.contains("雪纺") || styleName.contains("真丝") || styleName.contains("丝")) {
            keywords.add("易滑丝");
            tipBuilder.append("💡 此为易滑丝面料，建议换用特氟龙压脚并放慢车缝速度！\n");
        } else if (styleName.contains("拼") || styleName.contains("撞色")) {
            keywords.add("防染色");
            tipBuilder.append("💡 深浅撞色极易互染，做完后务必隔离堆放，切勿直接贴合！\n");
        } else if (styleName.contains("PU") || styleName.contains("皮")) {
            keywords.add("防留孔");
            tipBuilder.append("💡 皮料极易留针孔，一旦车错无法返工，请务必保证一步到位！\n");
        }

        // 追加生产要求和样衣审核意见
        if (StringUtils.hasText(order.getRemarks())) {
            tipBuilder.append("📋 生产要求：").append(order.getRemarks()).append("\n");
        }

        if (style != null && StringUtils.hasText(style.getSampleReviewComment())) {
            tipBuilder.append("📋 样衣审核：").append(style.getSampleReviewComment()).append("\n");
        }

        // 针对特殊工序的提醒
        if (StringUtils.hasText(processName)) {
            if (processName.contains("袖") || processName.contains("领")) {
                tipBuilder.append("🎯 关键工序：请注意车位平整度及对称。");
            }
        }

        String aiTip = tipBuilder.toString().trim();
        if (StringUtils.hasText(aiTip)) {
            response.setAiTip(aiTip);
        }
        response.setKeywords(keywords);

        return response;
    }
}
