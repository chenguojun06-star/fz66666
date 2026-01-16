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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class DataCenterQueryServiceImpl implements DataCenterQueryService {

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleSizeService styleSizeService;

    @Autowired
    private StyleAttachmentService styleAttachmentService;

    @Override
    public long countEnabledStyles() {
        return styleInfoService.lambdaQuery().eq(StyleInfo::getStatus, "ENABLED").count();
    }

    @Override
    public long countMaterialPurchases() {
        return materialPurchaseService.lambdaQuery().eq(MaterialPurchase::getDeleteFlag, 0).count();
    }

    @Override
    public long countProductionOrders() {
        return productionOrderService.lambdaQuery().eq(ProductionOrder::getDeleteFlag, 0).count();
    }

    @Override
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
    public List<StyleBom> listBom(Long styleId) {
        return styleBomService.listByStyleId(styleId);
    }

    @Override
    public List<StyleSize> listSize(Long styleId) {
        return styleSizeService.listByStyleId(styleId);
    }

    @Override
    public List<StyleAttachment> listAttachments(Long styleId) {
        return styleAttachmentService.listByStyleId(String.valueOf(styleId));
    }
}
