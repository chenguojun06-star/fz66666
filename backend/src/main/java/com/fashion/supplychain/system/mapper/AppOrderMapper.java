package com.fashion.supplychain.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.system.entity.AppOrder;
import org.apache.ibatis.annotations.Mapper;

/**
 * 应用订单Mapper
 */
@Mapper
public interface AppOrderMapper extends BaseMapper<AppOrder> {
}
