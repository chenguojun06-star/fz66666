package com.fashion.supplychain.style.helper;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.PatternScanRecord;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.PatternScanRecordService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * D-217：款号变更后的快照全链同步。
 * 样衣生产单、样衣扫码记录、扫码镜像（scan_type=pattern，order_no 冗余存款号）、
 * 生产订单、裁剪菲号都按 style_id 快照了 style_no——不改的话扫码端/详情页永远显示老款号。
 * 与 resyncSkuCodesForStyleNoChange 同范式：失败 log.warn 不阻断主流程。
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class StyleNoChangeSyncHelper {

    private final PatternProductionService patternProductionService;
    private final PatternScanRecordService patternScanRecordService;
    private final ScanRecordService scanRecordService;
    private final CuttingBundleService cuttingBundleService;
    private final ProductionOrderMapper productionOrderMapper;

    public void syncStyleNoEverywhere(Long styleId, String oldStyleNo, String newStyleNo) {
        if (styleId == null || !StringUtils.hasText(newStyleNo)
                || newStyleNo.equals(oldStyleNo)) {
            return;
        }
        String sid = String.valueOf(styleId);

        try {
            boolean ok = patternProductionService.update(new LambdaUpdateWrapper<PatternProduction>()
                    .eq(PatternProduction::getStyleId, sid)
                    .eq(PatternProduction::getStyleNo, oldStyleNo)
                    .set(PatternProduction::getStyleNo, newStyleNo));
            log.info("款号变更同步样衣生产单: styleId={}, updated={}", styleId, ok);
        } catch (Exception e) {
            log.warn("款号变更同步样衣生产单失败: styleId={}, err={}", styleId, e.getMessage());
        }

        try {
            boolean ok = patternScanRecordService.update(new LambdaUpdateWrapper<PatternScanRecord>()
                    .eq(PatternScanRecord::getStyleId, sid)
                    .eq(PatternScanRecord::getStyleNo, oldStyleNo)
                    .set(PatternScanRecord::getStyleNo, newStyleNo));
            log.info("款号变更同步样衣扫码记录: styleId={}, updated={}", styleId, ok);
        } catch (Exception e) {
            log.warn("款号变更同步样衣扫码记录失败: styleId={}, err={}", styleId, e.getMessage());
        }

        try {
            // 扫码镜像：style_id 或 order_no（冗余款号）两个入口都收；顺带把缺失的 style_id 补上
            boolean ok = scanRecordService.update(new LambdaUpdateWrapper<ScanRecord>()
                    .eq(ScanRecord::getScanType, "pattern")
                    .and(w -> w.eq(ScanRecord::getStyleId, sid).or().eq(ScanRecord::getOrderNo, oldStyleNo))
                    .set(ScanRecord::getStyleId, sid)
                    .set(ScanRecord::getOrderNo, newStyleNo)
                    .set(ScanRecord::getStyleNo, newStyleNo));
            log.info("款号变更同步扫码镜像记录: styleId={}, updated={}", styleId, ok);
        } catch (Exception e) {
            log.warn("款号变更同步扫码镜像记录失败: styleId={}, err={}", styleId, e.getMessage());
        }

        try {
            int rows = productionOrderMapper.update(null, new LambdaUpdateWrapper<ProductionOrder>()
                    .eq(ProductionOrder::getStyleId, sid)
                    .eq(ProductionOrder::getStyleNo, oldStyleNo)
                    .set(ProductionOrder::getStyleNo, newStyleNo));
            if (rows > 0) {
                log.info("款号变更同步生产订单: styleId={}, updated={}", styleId, rows);
            }
        } catch (Exception e) {
            log.warn("款号变更同步生产订单失败: styleId={}, err={}", styleId, e.getMessage());
        }

        try {
            boolean ok = cuttingBundleService.update(new LambdaUpdateWrapper<CuttingBundle>()
                    .eq(CuttingBundle::getStyleId, sid)
                    .eq(CuttingBundle::getStyleNo, oldStyleNo)
                    .set(CuttingBundle::getStyleNo, newStyleNo));
            log.info("款号变更同步裁剪菲号: styleId={}, updated={}", styleId, ok);
        } catch (Exception e) {
            log.warn("款号变更同步裁剪菲号失败: styleId={}, err={}", styleId, e.getMessage());
        }
    }
}
