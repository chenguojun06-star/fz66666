package com.fashion.supplychain.style.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.style.entity.StyleInfo;
import java.time.LocalDateTime;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 样板生产记录的自动创建与同步 — 从 StyleInfoOrchestrator 拆出
 */
@Component
@Slf4j
public class StylePatternProductionHelper {

    @Autowired
    private PatternProductionService patternProductionService;

    /**
     * 款式保存时自动创建样板生产记录
     */
    public void createPatternProductionRecord(StyleInfo styleInfo) {
        if (styleInfo == null || styleInfo.getId() == null) {
            return;
        }

        long existingCount = patternProductionService.lambdaQuery()
                .eq(PatternProduction::getStyleId, String.valueOf(styleInfo.getId()))
                .count();

        if (existingCount > 0) {
            log.info("样板生产记录已存在，跳过自动创建: styleId={}", styleInfo.getId());
            return;
        }

        String progressNodesJson = "{\"cutting\":0,\"sewing\":0,\"ironing\":0,\"quality\":0,\"secondary\":0,\"packaging\":0}";

        PatternProduction patternProduction = new PatternProduction();
        patternProduction.setStyleId(String.valueOf(styleInfo.getId()));
        patternProduction.setStyleNo(styleInfo.getStyleNo());

        String color = styleInfo.getColor();
        if (!StringUtils.hasText(color)) {
            color = "-";
        }
        patternProduction.setColor(color);

        Integer quantity = styleInfo.getSampleQuantity();
        if (quantity == null || quantity == 0) {
            quantity = 1;
        }
        patternProduction.setQuantity(quantity);

        patternProduction.setReleaseTime(styleInfo.getCreateTime());
        patternProduction.setDeliveryTime(styleInfo.getDeliveryDate());
        patternProduction.setStatus("PENDING");
        patternProduction.setProgressNodes(progressNodesJson);
        patternProduction.setCreateTime(LocalDateTime.now());
        patternProduction.setUpdateTime(LocalDateTime.now());
        patternProduction.setHasSecondaryProcess(1);

        UserContext ctx = UserContext.get();
        if (ctx != null) {
            patternProduction.setCreateBy(ctx.getUsername());
        }

        boolean saved = patternProductionService.save(patternProduction);
        if (saved) {
            log.info("自动创建样板生产记录成功: styleId={}, styleNo={}, patternId={}, color={}, quantity={}",
                    styleInfo.getId(), styleInfo.getStyleNo(), patternProduction.getId(),
                    styleInfo.getColor(), styleInfo.getSampleQuantity());
        }
    }

    /**
     * 款式更新时同步样板生产记录的颜色、数量、交板时间
     */
    public void syncPatternProductionInfo(StyleInfo styleInfo) {
        if (styleInfo == null || styleInfo.getId() == null) {
            return;
        }

        LambdaQueryWrapper<PatternProduction> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PatternProduction::getStyleId, String.valueOf(styleInfo.getId()))
                .eq(PatternProduction::getDeleteFlag, 0);

        List<PatternProduction> records = patternProductionService.list(wrapper);
        if (records == null || records.isEmpty()) {
            return;
        }

        String color = styleInfo.getColor();
        if (!StringUtils.hasText(color)) {
            color = "-";
        }
        Integer quantity = styleInfo.getSampleQuantity();
        if (quantity == null || quantity == 0) {
            quantity = 1;
        }

        for (PatternProduction record : records) {
            record.setColor(color);
            record.setQuantity(quantity);
            record.setDeliveryTime(styleInfo.getDeliveryDate());
            record.setUpdateTime(LocalDateTime.now());
        }

        boolean updated = patternProductionService.updateBatchById(records);
        if (updated) {
            log.info("同步样板生产记录成功: styleId={}, recordCount={}, color={}, quantity={}",
                    styleInfo.getId(), records.size(), color, quantity);
        }
    }
}
