package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import org.apache.ibatis.annotations.Mapper;

/**
 * 生产订单Mapper接口
 */
@Mapper
public interface ProductionOrderMapper extends BaseMapper<ProductionOrder> {
}
