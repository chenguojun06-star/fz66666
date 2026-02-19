package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.OrderTransfer;
import org.apache.ibatis.annotations.Mapper;

/**
 * 订单转移Mapper接口
 */
@Mapper
public interface OrderTransferMapper extends BaseMapper<OrderTransfer> {
}
