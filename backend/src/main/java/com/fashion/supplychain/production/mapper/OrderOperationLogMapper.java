package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.OrderOperationLog;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface OrderOperationLogMapper extends BaseMapper<OrderOperationLog> {
}