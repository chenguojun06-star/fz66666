package com.fashion.supplychain.datacenter.orchestration;

import com.fashion.supplychain.style.entity.StyleInfo;
import java.util.HashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class DataCenterOrchestrator {

    /**
     * D-693：原为 {@code DataCenterQueryService}（datacenter.service 包），随其实现类
     * 更名 {@code DataCenterQueryOrchestrator} 一并调整类型引用。
     * 二者现同在 orchestration 包，故删除 import（同包无需 import —— D-661 教训）。
     */
    @Autowired
    private DataCenterQueryOrchestrator dataCenterQueryOrchestrator;

    public Map<String, Object> stats() {
        long styleCount = dataCenterQueryOrchestrator.countEnabledStyles();
        long materialCount = dataCenterQueryOrchestrator.countMaterialPurchases();
        long productionCount = dataCenterQueryOrchestrator.countProductionOrders();

        Map<String, Object> data = new HashMap<>();
        data.put("styleCount", styleCount);
        data.put("materialCount", materialCount);
        data.put("productionCount", productionCount);
        return data;
    }

    public Map<String, Object> productionSheet(String styleNo, Long styleId) {
        StyleInfo style = dataCenterQueryOrchestrator.findStyle(styleId, styleNo);
        if (style == null) {
            throw new NoSuchElementException("款号不存在");
        }

        Long sid = style.getId();
        Map<String, Object> data = new HashMap<>();
        data.put("style", style);
        data.put("bomList", dataCenterQueryOrchestrator.listBom(sid));
        data.put("sizeList", dataCenterQueryOrchestrator.listSize(sid));
        data.put("attachments", dataCenterQueryOrchestrator.listAttachments(sid));
        return data;
    }
}
