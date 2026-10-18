package com.fashion.supplychain.pos.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.pos.entity.PosReturn;
import org.apache.ibatis.annotations.Mapper;

/** D-816：POS 退货单头 Mapper。 */
@Mapper
public interface PosReturnMapper extends BaseMapper<PosReturn> {
}
