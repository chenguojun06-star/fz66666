package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.PurchaseReturn;
import org.apache.ibatis.annotations.Mapper;

/**
 * 采购退货单Mapper
 * 对应表: t_purchase_return
 */
@Mapper
public interface PurchaseReturnMapper extends BaseMapper<PurchaseReturn> {
}