package com.fashion.supplychain.template.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.template.entity.UnitPriceAuditLog;
import java.math.BigDecimal;
import java.util.List;

public interface UnitPriceAuditLogService extends IService<UnitPriceAuditLog> {

    /**
     * 记录单价变更
     */
    void logPriceChange(String styleNo, String processName, BigDecimal oldPrice, BigDecimal newPrice,
            String changeSource, String relatedId, String operator, String remark);

    /**
     * 查询款号单价变更历史
     */
    List<UnitPriceAuditLog> listByStyleNo(String styleNo);

    /**
     * 查询工序单价变更历史
     */
    List<UnitPriceAuditLog> listByStyleNoAndProcess(String styleNo, String processName);
}
