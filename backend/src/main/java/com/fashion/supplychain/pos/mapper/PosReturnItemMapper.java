package com.fashion.supplychain.pos.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.pos.entity.PosReturnItem;
import org.apache.ibatis.annotations.Mapper;

/** D-816：POS 退货单行 Mapper。 */
@Mapper
public interface PosReturnItemMapper extends BaseMapper<PosReturnItem> {
}
