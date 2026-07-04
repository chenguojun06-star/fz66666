package com.fashion.supplychain.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.crm.entity.SalesReturnItem;
import org.apache.ibatis.annotations.Mapper;

/**
 * 退货商品明细Mapper（P0铁律4：多租户隔离）
 */
@Mapper
public interface SalesReturnItemMapper extends BaseMapper<SalesReturnItem> {
}