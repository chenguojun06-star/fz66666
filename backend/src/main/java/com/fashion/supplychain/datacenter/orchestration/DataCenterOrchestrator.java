package com.fashion.supplychain.datacenter.orchestration;

import com.fashion.supplychain.datacenter.service.DataCenterQueryService;
import com.fashion.supplychain.style.entity.StyleInfo;
import java.util.HashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class DataCenterOrchestrator {

    @Autowired
    private DataCenterQueryService dataCenterQueryService;

    public Map<String, Object> stats() {
        long styleCount = dataCenterQueryService.countEnabledStyles();
        long materialCount = dataCenterQueryService.countMaterialPurchases();
        long productionCount = dataCenterQueryService.countProductionOrders();

        Map<String, Object> data = new HashMap<>();
        data.put("styleCount", styleCount);
        data.put("materialCount", materialCount);
        data.put("productionCount", productionCount);
        return data;
    }

    public Map<String, Object> productionSheet(String styleNo, Long styleId) {
        StyleInfo style = dataCenterQueryService.findStyle(styleId, styleNo);
        if (style == null) {
            throw new NoSuchElementException("款号不存在");
        }

        Long sid = style.getId();
        Map<String, Object> data = new HashMap<>();
        data.put("style", style);
        data.put("bomList", dataCenterQueryService.listBom(sid));
        data.put("sizeList", dataCenterQueryService.listSize(sid));
        data.put("attachments", dataCenterQueryService.listAttachments(sid));
        return data;
    }
}
