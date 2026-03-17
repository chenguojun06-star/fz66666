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
}
