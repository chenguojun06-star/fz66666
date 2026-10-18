package com.fashion.supplychain.pos.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.pos.entity.PosShift;
import org.apache.ibatis.annotations.Mapper;

/** D-817：交接班 Mapper。 */
@Mapper
public interface PosShiftMapper extends BaseMapper<PosShift> {
}
