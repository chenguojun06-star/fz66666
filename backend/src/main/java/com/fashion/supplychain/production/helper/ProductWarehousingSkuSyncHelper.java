package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * D-227：质检/手工入库 SKU 库存同步 Helper。
 * 背景：入库保存（save/batchSave）只写 t_product_warehousing，不同步 t_product_sku——
 * 入库明细 sku_code 为 NULL、SKU 行缺失，导致成品仓库列表（按 SKU 表查询）看不到新入库的款，
 * 库位地图按 NULL 分组塌缩成一行（如 BR26X1K0651A 显示"棕色XS 132件"，实际是 6 码合计）。
 * 职责（与 StyleSnapshotBackfillRunner 的直拼编码规范一致）：
 *  1) 生成直拼商品编码（款号+颜色+尺码，无分隔符）并回填入库明细 sku_code
 *  2) upsert t_product_sku：行存在则累加库存，缺失则按款式档案补建
 * 全程 try-catch：同步失败只记日志，不阻断入库主流程。
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ProductWarehousingSkuSyncHelper {

    private final ProductSkuService productSkuService;
    private final StyleInfoService styleInfoService;
    private final ProductWarehousingService productWarehousingService;

    /**
     * 入库成功后同步 SKU 库存。deltaQuantity 为本次入库合格数量（正数）。
     */
    public void syncSkuStockOnInbound(ProductWarehousing w) {
        try {
            if (w == null || !StringUtils.hasText(w.getId())) {
                return;
            }
            int qty = w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0;
            if (qty <= 0) {
                return;
            }
            String styleNo = trimToNull(w.getStyleNo());
            String color = trimToNull(w.getColor());
            String size = trimToNull(w.getSize());
            if (styleNo == null || color == null || size == null) {
                log.warn("[WarehousingSkuSync] 入库明细行内款号/颜色/尺码不完整，跳过SKU同步: warehousingId={}, styleNo={}, color={}, size={}",
                        w.getId(), w.getStyleNo(), w.getColor(), w.getSize());
                return;
            }
            Long tenantId = w.getTenantId();
            String skuCode = styleNo + color + size;

            // 1) 回填入库明细 sku_code（幂等：已一致则不更新）
            if (!skuCode.equals(trimToNull(w.getSkuCode()))) {
                productWarehousingService.update(new LambdaUpdateWrapper<ProductWarehousing>()
                        .eq(ProductWarehousing::getId, w.getId())
                        .set(ProductWarehousing::getSkuCode, skuCode));
                w.setSkuCode(skuCode);
            }

            // 2) upsert SKU 行
            ProductSku sku = productSkuService.getBySkuCode(skuCode);
            if (sku == null) {
                // 编码格式差异防护：按 款号+颜色+尺码+租户 再找一次，避免建出重复行
                sku = productSkuService.lambdaQuery()
                        .eq(ProductSku::getStyleNo, styleNo)
                        .eq(ProductSku::getColor, color)
                        .eq(ProductSku::getSize, size)
                        .eq(tenantId != null, ProductSku::getTenantId, tenantId)
                        .last("LIMIT 1")
                        .one();
            }
            if (sku != null) {
                int current = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
                sku.setStockQuantity(current + qty);
                productSkuService.updateById(sku);
                log.info("[WarehousingSkuSync] SKU库存累加: skuCode={}, {} + {} = {}",
                        skuCode, current, qty, sku.getStockQuantity());
                return;
            }

            // 3) 缺行补建（style_id NOT NULL，款式档案缺失则跳过）
            StyleInfo style = styleInfoService.lambdaQuery()
                    .eq(StyleInfo::getStyleNo, styleNo)
                    .eq(tenantId != null, StyleInfo::getTenantId, tenantId)
                    .last("LIMIT 1")
                    .one();
            if (style == null || style.getId() == null) {
                log.warn("[WarehousingSkuSync] 款式档案不存在，跳过SKU补建: styleNo={}, tenantId={}", styleNo, tenantId);
                return;
            }
            ProductSku created = new ProductSku();
            created.setSkuCode(skuCode);
            created.setStyleId(style.getId());
            created.setStyleNo(styleNo);
            created.setColor(color);
            created.setSize(size);
            created.setStockQuantity(qty);
            created.setStatus("ENABLED");
            created.setTenantId(tenantId);
            productSkuService.save(created);
            log.info("[WarehousingSkuSync] SKU行补建: skuCode={}, stock={}, styleId={}, tenantId={}",
                    skuCode, qty, style.getId(), tenantId);
        } catch (Exception e) {
            log.error("[WarehousingSkuSync] 入库同步SKU库存失败（不阻断主流程）: warehousingId={}, styleNo={}",
                    w != null ? w.getId() : null, w != null ? w.getStyleNo() : null, e);
        }
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
