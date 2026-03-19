package com.fashion.supplychain.warehouse.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.warehouse.entity.MaterialPickupRecord;
import org.apache.ibatis.annotations.Mapper;

/**
 * 面辅料领取记录 Mapper
 */
@Mapper
public interface MaterialPickupRecordMapper extends BaseMapper<MaterialPickupRecord> {
}
