package com.fashion.supplychain.pos.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.pos.entity.PosSaleItem;
import org.apache.ibatis.annotations.Mapper;

/**
 * 收银台销售单明细 Mapper（带 tenant_id，走租户隔离）。
 */
@Mapper
public interface PosSaleItemMapper extends BaseMapper<PosSaleItem> {
}
