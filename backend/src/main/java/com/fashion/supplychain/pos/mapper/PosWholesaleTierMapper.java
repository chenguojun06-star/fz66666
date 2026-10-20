package com.fashion.supplychain.pos.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.pos.entity.PosWholesaleTier;
import org.apache.ibatis.annotations.Mapper;

/** POS 批发阶梯价 Mapper（租户业务数据，保留租户隔离拦截器）。 */
@Mapper
public interface PosWholesaleTierMapper extends BaseMapper<PosWholesaleTier> {
}
