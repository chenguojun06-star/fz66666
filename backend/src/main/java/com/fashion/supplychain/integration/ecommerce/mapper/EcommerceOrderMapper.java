package com.fashion.supplychain.integration.ecommerce.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EcommerceOrderMapper extends BaseMapper<EcommerceOrder> {
}
