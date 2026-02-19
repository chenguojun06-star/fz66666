package com.fashion.supplychain.datacenter.service;

import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleSize;
import java.util.List;

public interface DataCenterQueryService {

    long countEnabledStyles();

    long countMaterialPurchases();

    long countProductionOrders();

    StyleInfo findStyle(Long styleId, String styleNo);

    List<StyleBom> listBom(Long styleId);

    List<StyleSize> listSize(Long styleId);

    List<StyleAttachment> listAttachments(Long styleId);
}
