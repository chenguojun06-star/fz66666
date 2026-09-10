package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.PurchaseOrderDoc;
import com.fashion.supplychain.production.mapper.PurchaseOrderDocMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PurchaseOrderDocService extends ServiceImpl<PurchaseOrderDocMapper, PurchaseOrderDoc> {

    /**
     * 查询指定订单的单据列表（按上传时间倒序）
     */
    public List<PurchaseOrderDoc> listByOrderNo(Long tenantId, String orderNo) {
        QueryWrapper<PurchaseOrderDoc> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
          .eq("order_no", orderNo)
          .eq("delete_flag", 0)
          .orderByDesc("create_time");
        return list(qw);
    }

    /**
     * 查询指定款号的单据列表（样衣采购无订单号，按款号归属；D-360d）
     */
    public List<PurchaseOrderDoc> listByStyleNo(Long tenantId, String styleNo) {
        QueryWrapper<PurchaseOrderDoc> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
          .eq("style_no", styleNo)
          .eq("delete_flag", 0)
          .orderByDesc("create_time");
        return list(qw);
    }
}
