package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.PurchaseReturnItem;
import org.apache.ibatis.annotations.Mapper;

/**
 * 采购退货物料明细Mapper
 * 对应表: t_purchase_return_item
 */
@Mapper
public interface PurchaseReturnItemMapper extends BaseMapper<PurchaseReturnItem> {
}