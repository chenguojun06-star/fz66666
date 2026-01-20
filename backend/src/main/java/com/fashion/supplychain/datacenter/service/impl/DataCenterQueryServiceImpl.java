package com.fashion.supplychain.datacenter.service.impl;

import com.fashion.supplychain.datacenter.service.DataCenterQueryService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleSize;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleSizeService;
import java.util.List;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class DataCenterQueryServiceImpl implements DataCenterQueryService {

    private final StyleInfoService styleInfoService;
    private final MaterialPurchaseService materialPurchaseService;
    private final ProductionOrderService productionOrderService;
    private final StyleBomService styleBomService;
    private final StyleSizeService styleSizeService;
    private final StyleAttachmentService styleAttachmentService;

    public DataCenterQueryServiceImpl(
            StyleInfoService styleInfoService,
            MaterialPurchaseService materialPurchaseService,
            ProductionOrderService productionOrderService,
            StyleBomService styleBomService,
            StyleSizeService styleSizeService,
            StyleAttachmentService styleAttachmentService) {
        this.styleInfoService = styleInfoService;
        this.materialPurchaseService = materialPurchaseService;
        this.productionOrderService = productionOrderService;
        this.styleBomService = styleBomService;
        this.styleSizeService = styleSizeService;
        this.styleAttachmentService = styleAttachmentService;
    }

    @Override
    @Cacheable(value = "dataCenter", key = "'enabledStylesCount'")
    public long countEnabledStyles() {
        return styleInfoService.lambdaQuery().eq(StyleInfo::getStatus, "ENABLED").count();
    }

    @Override
    @Cacheable(value = "dataCenter", key = "'materialPurchasesCount'")
    public long countMaterialPurchases() {
        return materialPurchaseService.lambdaQuery().eq(MaterialPurchase::getDeleteFlag, 0).count();
    }

    @Override
    @Cacheable(value = "dataCenter", key = "'productionOrdersCount'")
    public long countProductionOrders() {
        return productionOrderService.lambdaQuery().eq(ProductionOrder::getDeleteFlag, 0).count();
    }

    @Override
    @Cacheable(value = "style", key = "#styleId != null ? 'style:' + #styleId : (#styleNo != null ? 'styleByNo:' + #styleNo.trim() : 'style:null')")
    public StyleInfo findStyle(Long styleId, String styleNo) {
        if (styleId != null) {
            return styleInfoService.getById(styleId);
        }
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        if (!StringUtils.hasText(sn)) {
            return null;
        }
        return styleInfoService.lambdaQuery().eq(StyleInfo::getStyleNo, sn).one();
    }

    @Override
    @Cacheable(value = "style", key = "'bom:' + #styleId")
    public List<StyleBom> listBom(Long styleId) {
        return styleBomService.listByStyleId(styleId);
    }

    @Override
    @Cacheable(value = "style", key = "'size:' + #styleId")
    public List<StyleSize> listSize(Long styleId) {
        return styleSizeService.listByStyleId(styleId);
    }

    @Override
    @Cacheable(value = "style", key = "'attachments:' + #styleId")
    public List<StyleAttachment> listAttachments(Long styleId) {
        return styleAttachmentService.listByStyleId(String.valueOf(styleId));
    }
}
