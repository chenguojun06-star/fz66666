package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.PatternScanRecord;
import org.apache.ibatis.annotations.Mapper;

/**
 * 样板生产扫码记录Mapper
 */
@Mapper
public interface PatternScanRecordMapper extends BaseMapper<PatternScanRecord> {
}
