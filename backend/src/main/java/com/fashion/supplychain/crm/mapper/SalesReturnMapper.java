package com.fashion.supplychain.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.crm.entity.SalesReturn;
import org.apache.ibatis.annotations.Mapper;

/**
 * 销售退货单Mapper（P0铁律4：多租户隔离）
 */
@Mapper
public interface SalesReturnMapper extends BaseMapper<SalesReturn> {
}