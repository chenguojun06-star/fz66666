package com.fashion.supplychain.style.orchestration;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.ProductSkuMapper;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

@Service
@Slf4j
public class ProductSkuOrchestrator {

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private StyleInfoMapper styleInfoMapper;

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private ProductSkuMapper productSkuMapper;

    public List<ProductSku> listByStyleId(Long styleId) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        return productSkuService.listByStyleId(styleId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void batchUpdateSkus(Long styleId, List<ProductSku> skuList, List<Long> deletedIds) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        StyleInfo style = styleInfoMapper.selectById(styleId);
        if (style == null) {
            throw new IllegalArgumentException("款式不存在: " + styleId);
        }

        if (deletedIds != null && !deletedIds.isEmpty()) {
            for (Long id : deletedIds) {
                ProductSku existing = productSkuService.getById(id);
                if (existing != null && existing.getStyleId().equals(styleId)) {
                    productSkuService.removeById(id);
                    log.info("Deleted SKU id={}, skuCode={}", id, existing.getSkuCode());
                }
            }
        }

        if (skuList != null && !skuList.isEmpty()) {
            productSkuService.batchUpdateSkus(styleId, skuList);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateSkuMode(Long styleId, String skuMode) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        if (!"AUTO".equals(skuMode) && !"MANUAL".equals(skuMode)) {
            throw new IllegalArgumentException("skuMode must be AUTO or MANUAL");
        }
        productSkuService.updateSkuMode(styleId, skuMode);
        if ("AUTO".equals(skuMode)) {
            productSkuService.syncSkusToProduction(styleId);
            log.info("Auto-synced SKUs to production after switching to AUTO mode: styleId={}", styleId);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void syncSkusToProduction(Long styleId) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        productSkuService.syncSkusToProduction(styleId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void syncSkus(Long styleId) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        productSkuService.generateSkusForStyle(styleId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateSkc(Long styleId, String newSkc) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        if (!StringUtils.hasText(newSkc)) {
            throw new IllegalArgumentException("SKC不能为空");
        }
        StyleInfo style = styleInfoMapper.selectById(styleId);
        if (style == null) {
            throw new IllegalArgumentException("款式不存在: " + styleId);
        }

        String oldSkc = style.getSkc();
        if (newSkc.equals(oldSkc)) {
            return;
        }

        style.setSkc(newSkc.trim());
        styleInfoMapper.updateById(style);
        log.info("Updated SKC for styleId={}: {} -> {}", styleId, oldSkc, newSkc);

        int syncCount = productionOrderMapper.update(null,
                new LambdaUpdateWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getStyleNo, style.getStyleNo())
                        .eq(ProductionOrder::getTenantId, style.getTenantId())
                        .ne(ProductionOrder::getSkc, newSkc.trim())
                        .set(ProductionOrder::getSkc, newSkc.trim()));
        if (syncCount > 0) {
            log.info("Synced SKC to {} production orders for styleNo={}", syncCount, style.getStyleNo());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void saveRollbackRemark(Long styleId, String remark) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        StyleInfo style = styleInfoMapper.selectById(styleId);
        if (style == null) {
            throw new IllegalArgumentException("款式不存在: " + styleId);
        }
        if (!StringUtils.hasText(remark)) {
            return;
        }
        Long tenantId = UserContext.tenantId();
        int rows = productSkuMapper.update(null,
                new LambdaUpdateWrapper<ProductSku>()
                        .eq(ProductSku::getStyleId, styleId)
                        .eq(tenantId != null, ProductSku::getTenantId, tenantId)
                        .set(ProductSku::getRemark, remark.trim()));
        log.info("Saved rollback remark for styleId={}, affected {} SKUs", styleId, rows);
    }
}
